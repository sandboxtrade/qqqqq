import type { CompanionRepository } from "./repositories/interfaces";
import { InMemoryCompanionRepository } from "./repositories/in-memory-repository";
import { FirestoreCompanionRepository } from "./repositories/firestore-repository";
import {
  isFirebaseConfigured,
  isLocalRepositoryAllowed,
} from "./firebase";
import { assertRuntimeConfiguration } from "../config/runtime-config";
import { bounded, checkSignal } from "../core/async";

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
        return bounded(
          Promise.resolve(method.apply(object, args)),
          8000,
          "Firebase",
          signal,
        ).then((value) => {
          checkSignal(signal);
          return value;
        });
      };
    },
  });
}
