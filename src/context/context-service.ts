import { defaultCharacter } from "../character/character";
import { checkSignal } from "../core/async";
import { getCompanionRepository } from "../storage/repository-factory";
import {
  createDefaultEditableContext,
  normalizeEditableContext,
  type YuzukiEditableContext,
  type YuzukiEditableContextPatch,
} from "./yuzuki-context";

export async function loadYuzukiEditableContext(uid: string | null, signal?: AbortSignal) {
  checkSignal(signal);
  const repository = getCompanionRepository(defaultCharacter.id, uid, signal);
  const stored = await repository.loadEditableContext();
  checkSignal(signal);
  return stored ? normalizeEditableContext(stored) : createDefaultEditableContext();
}

export async function saveYuzukiEditableContext(
  uid: string | null,
  signal: AbortSignal | undefined,
  context: YuzukiEditableContext,
) {
  checkSignal(signal);
  const repository = getCompanionRepository(defaultCharacter.id, uid, signal);
  const saved = await repository.saveEditableContext(normalizeEditableContext(context, Date.now()));
  checkSignal(signal);
  return saved;
}

export async function updateYuzukiEditableContext(
  uid: string | null,
  signal: AbortSignal | undefined,
  patch: YuzukiEditableContextPatch,
) {
  checkSignal(signal);
  const repository = getCompanionRepository(defaultCharacter.id, uid, signal);
  const saved = await repository.updateEditableContext({
    ...patch,
    updatedAt: patch.updatedAt ?? Date.now(),
  });
  checkSignal(signal);
  return saved;
}
