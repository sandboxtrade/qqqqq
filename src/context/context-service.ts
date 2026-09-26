import { defaultCharacter } from "../character/character";
import { getCharacterProfile } from "../character/character-registry";
import { checkSignal } from "../core/async";
import { getCompanionRepository } from "../storage/repository-factory";
import {
  createDefaultEditableContext,
  normalizeEditableContext,
  type YuzukiEditableContext,
  type YuzukiEditableContextPatch,
} from "./yuzuki-context";

export async function loadCharacterEditableContext(
  characterId: string,
  uid: string | null,
  signal?: AbortSignal,
) {
  checkSignal(signal);
  const profile = getCharacterProfile(characterId);
  const repository = getCompanionRepository(profile.id, uid, signal);
  const stored = await repository.loadEditableContext();
  checkSignal(signal);
  return stored
    ? normalizeEditableContext(stored, Date.now(), profile.defaultPersonality, profile.defaultMemory)
    : createDefaultEditableContext(Date.now(), profile.defaultPersonality, profile.defaultMemory);
}

export async function saveCharacterEditableContext(
  characterId: string,
  uid: string | null,
  signal: AbortSignal | undefined,
  context: YuzukiEditableContext,
) {
  checkSignal(signal);
  const profile = getCharacterProfile(characterId);
  const repository = getCompanionRepository(profile.id, uid, signal);
  const saved = await repository.saveEditableContext(
    normalizeEditableContext(context, Date.now(), profile.defaultPersonality, profile.defaultMemory),
  );
  checkSignal(signal);
  return saved;
}

export async function updateCharacterEditableContext(
  characterId: string,
  uid: string | null,
  signal: AbortSignal | undefined,
  patch: YuzukiEditableContextPatch,
) {
  checkSignal(signal);
  const profile = getCharacterProfile(characterId);
  const repository = getCompanionRepository(profile.id, uid, signal);
  const now = Date.now();
  const saved = await repository.updateEditableContext({
    ...patch,
    updatedAt: patch.updatedAt ?? now,
  }, createDefaultEditableContext(now, profile.defaultPersonality, profile.defaultMemory));
  checkSignal(signal);
  return normalizeEditableContext(saved, saved.updatedAt, profile.defaultPersonality, profile.defaultMemory);
}

// Compatibility aliases for old imports/tests. New code should use the generic
// character-aware functions above.
export const loadYuzukiEditableContext = (uid: string | null, signal?: AbortSignal) =>
  loadCharacterEditableContext(defaultCharacter.id, uid, signal);
export const saveYuzukiEditableContext = (
  uid: string | null,
  signal: AbortSignal | undefined,
  context: YuzukiEditableContext,
) => saveCharacterEditableContext(defaultCharacter.id, uid, signal, context);
export const updateYuzukiEditableContext = (
  uid: string | null,
  signal: AbortSignal | undefined,
  patch: YuzukiEditableContextPatch,
) => updateCharacterEditableContext(defaultCharacter.id, uid, signal, patch);
