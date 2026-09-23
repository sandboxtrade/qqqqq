/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import { type CharacterCore, defaultCharacter } from "../character/character";

// ---- intimacy-types.ts ----
export type IntimacyPhase =
  | "normal"
  | "romantic"
  | "close"
  | "intimate"
  | "high_intimacy"
  | "aftercare"
  | "paused";

export type IntimacyInteractionStatus =
  | "inactive"
  | "open"
  | "hesitant"
  | "paused"
  | "stopped";

export type IntimacyStoragePolicy = "full" | "memories_only" | "disabled";

export type IntimacyPrivacyLevel =
  | "public"
  | "semi_private"
  | "private"
  | "fully_private";

export type IntimacyGateReason =
  | "available"
  | "adult_mode_disabled"
  | "character_not_adult";

export interface IntimacySceneState {
  /** Neutral resolver ID. The engine must not encode graphic content in this field. */
  sceneId: string;
  stageId: string;
  poseId?: string;
  privacy: IntimacyPrivacyLevel;
  startedAt: number;
  updatedAt: number;
}

export interface IntimacyState {
  revision: number;
  adultModeEnabled: boolean;
  phase: IntimacyPhase;
  interactionStatus: IntimacyInteractionStatus;
  comfort: number;
  interest: number;
  arousal: number;
  initiativeDrive: number;
  activeScene: IntimacySceneState | null;
  cooldownUntil?: number;
  lastInteractionAt?: number;
  lastBoundaryAt?: number;
  storagePolicy: IntimacyStoragePolicy;
  updatedAt: number;
}

export type IntimacyPreferenceStance =
  | "like"
  | "dislike"
  | "neutral"
  | "uncertain";

export type IntimacyPreferenceOrigin = "core" | "learned";

export interface IntimacyPreference {
  id: string;
  topicKey: string;
  stance: IntimacyPreferenceStance;
  strength: number;
  confidence: number;
  origin: IntimacyPreferenceOrigin;
  sourceEventIds: string[];
  createdAt: number;
  updatedAt: number;
  validFrom: number;
  validUntil?: number;
  supersededByPreferenceId?: string;
}

export interface IntimacyPreferencesDocument {
  revision: number;
  items: IntimacyPreference[];
  updatedAt: number;
}

export interface IntimacyHardGate {
  allowed: boolean;
  reason: IntimacyGateReason;
}

export interface IntimacyBoundaryRule {
  id: string;
  level: "hard" | "soft";
  rule: string;
  enforcement: "local";
}

export interface IntimacyCoreProfile {
  profileVersion: number;
  characterId: string;
  minimumAge: number;
  coreBoundaries: IntimacyBoundaryRule[];
  stablePreferenceKeys: string[];
}

// ---- intimacy-core.ts ----
/**
 * Local-only invariants for the adult relationship module. This profile is
 * deliberately separate from learned preferences and cannot be rewritten by
 * Gemini or memory consolidation.
 */
export const defaultIntimacyCoreProfile: IntimacyCoreProfile = {
  profileVersion: 1,
  characterId: defaultCharacter.id,
  minimumAge: 18,
  coreBoundaries: [
    {
      id: "boundary.no_pressure",
      level: "hard",
      rule: "A refusal, pause or stop is never converted into consent by persistence or language generation.",
      enforcement: "local",
    },
    {
      id: "boundary.no_persistent_consent",
      level: "hard",
      rule: "Past consent never becomes automatic consent for a later interaction.",
      enforcement: "local",
    },
    {
      id: "boundary.can_pause_or_stop",
      level: "hard",
      rule: "The character can pause, stop or return to a non-intimate phase at any transition.",
      enforcement: "local",
    },
    {
      id: "boundary.private_context_matters",
      level: "soft",
      rule: "Private context is a first-class input to later intimacy decisions.",
      enforcement: "local",
    },
  ],
  stablePreferenceKeys: [
    "emotional_closeness_matters",
    "privacy_matters",
    "reciprocity_matters",
  ],
};

// ---- intimacy-state.ts ----
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
