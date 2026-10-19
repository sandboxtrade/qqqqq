import type { CompanionRepository } from "./repositories/interfaces";
import { InMemoryCompanionRepository } from "./repositories/in-memory-repository";
import { FirestoreCompanionRepository } from "./repositories/firestore-repository";
import {
  isFirebaseConfigured,
  isLocalRepositoryAllowed,
} from "./firebase";
import { assertRuntimeConfiguration } from "../config/runtime-config";
import { bounded, checkSignal } from "../core/async";
import { annotateFirestoreOperation, FIRESTORE_READ_TIMEOUT_MS, mayTimeOutFirestoreOperation } from "./firestore-operation-policy";

const local = new Map<string, CompanionRepository>();

export function getCompanionRepository(
  characterId: string,
  uid: string | null,
  signal?: AbortSignal,
): CompanionRepository {
  assertRuntimeConfiguration();

  if (isFirebaseConfigured && !uid)
    throw new Error("Для доступа к данным нужен вход в Google.");

  let target: CompanionRepository;
  if (isFirebaseConfigured) {
    target = new FirestoreCompanionRepository(characterId, uid!, () =>
      checkSignal(signal),
    );
  } else {
    if (!isLocalRepositoryAllowed)
      throw new Error("Локальное хранилище отключено для этой сборки.");
    if (!local.has(characterId))
      local.set(characterId, new InMemoryCompanionRepository());
    target = local.get(characterId)!;
  }

  return new Proxy(target, {
    get(object, key) {
      const method = Reflect.get(object, key);
      if (typeof method !== "function") return method;
      return (...args: unknown[]) => {
        checkSignal(signal);
        const operation = String(key);
        const inFlight = Promise.resolve().then(() => method.apply(object, args));
        // A timeout on a Firestore write does NOT cancel the SDK transaction.
        // The previous 8-second blanket timeout could therefore leave a write
        // running while a duplicate attempt was already being submitted.
        const result = isFirebaseConfigured && mayTimeOutFirestoreOperation(operation)
          ? bounded(inFlight, FIRESTORE_READ_TIMEOUT_MS, `Firestore:${operation}`, signal)
          : inFlight;
        return result.catch((error: unknown) => {
          throw isFirebaseConfigured ? annotateFirestoreOperation(error, operation) : error;
        }).then((value: unknown) => {
          checkSignal(signal);
          return value;
        });
      };
    },
  });
}
