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
