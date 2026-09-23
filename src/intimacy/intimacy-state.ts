import type { CharacterCore } from "../character/character-types";
import type {
  IntimacyHardGate,
  IntimacyPreferencesDocument,
  IntimacyState,
} from "./intimacy-types";

export function createInitialIntimacyState(now = Date.now()): IntimacyState {
  return {
    revision: 0,
    adultModeEnabled: false,
    phase: "normal",
    interactionStatus: "inactive",
    comfort: 0,
    interest: 0,
    arousal: 0,
    initiativeDrive: 0,
    activeScene: null,
    storagePolicy: "memories_only",
    updatedAt: now,
  };
}

export function createInitialIntimacyPreferences(
  now = Date.now(),
): IntimacyPreferencesDocument {
  return {
    revision: 0,
    items: [],
    updatedAt: now,
  };
}

/**
 * Hard architecture gate only. It intentionally does not decide whether the
 * character wants a specific interaction; relationship/emotion/context belong
 * to the later intimacy decision engine.
 */
export function evaluateIntimacyHardGate(
  character: CharacterCore,
  state: IntimacyState,
): IntimacyHardGate {
  if (!character.adult || character.age < 18)
    return { allowed: false, reason: "character_not_adult" };
  if (!state.adultModeEnabled)
    return { allowed: false, reason: "adult_mode_disabled" };
  return { allowed: true, reason: "available" };
}

export function isNeutralIntimacySceneId(value: string) {
  return /^scene\.private\.[a-z0-9][a-z0-9._-]*$/u.test(value);
}

export function isNeutralIntimacyStageId(value: string) {
  return /^stage\.[a-z0-9][a-z0-9._-]*$/u.test(value);
}

export function isNeutralIntimacyPoseId(value: string) {
  return /^pose\.[a-z0-9][a-z0-9._-]*$/u.test(value);
}
