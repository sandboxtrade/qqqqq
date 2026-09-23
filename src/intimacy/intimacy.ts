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

// ---- local intimacy decision engine ----
export type IntimacySignalKind =
  | "none"
  | "affection"
  | "flirt"
  | "approach"
  | "consent"
  | "hesitant"
  | "pause"
  | "stop"
  | "resume"
  | "aftercare";

export interface IntimacySignal {
  kind: IntimacySignalKind;
  strength: number;
  /** Explicit means the current turn contains a direct cue. It is not persisted consent. */
  explicit: boolean;
  /** True when the words themselves clearly refer to intimacy rather than a generic "stop/continue". */
  intimacyContext?: boolean;
}

export interface IntimacyTurnInput {
  character: CharacterCore;
  previous?: IntimacyState;
  signal: IntimacySignal;
  emotion: import("../emotions/emotions").EmotionalState;
  relationship: import("../relationship/relationship").RelationshipState;
  world: import("../world/world").WorldState;
  now: number;
}

export type IntimacyTurnAction =
  | "none"
  | "gated"
  | "warmth"
  | "approach"
  | "reciprocate"
  | "check_in"
  | "pause"
  | "stop"
  | "resume"
  | "aftercare";

export interface IntimacyTurnResult {
  state: IntimacyState;
  action: IntimacyTurnAction;
  changed: boolean;
  gate: IntimacyHardGate;
}

const clampIntimacy = (value: number) => Math.max(0, Math.min(1, value));
const phaseOrder: readonly IntimacyPhase[] = [
  "normal", "romantic", "close", "intimate", "high_intimacy",
];

function intimacyPhaseRank(phase: IntimacyPhase) {
  const index = phaseOrder.indexOf(phase);
  return index < 0 ? 0 : index;
}

function nextIntimacyPhase(phase: IntimacyPhase, ceiling: IntimacyPhase) {
  const current = intimacyPhaseRank(phase);
  const max = intimacyPhaseRank(ceiling);
  return phaseOrder[Math.min(max, current + 1)] ?? "normal";
}

/**
 * Applies time decay without granting any new intimacy. Explicit current-turn
 * evidence is still required for escalation, so old consent can never advance
 * a later interaction on its own.
 */
export function currentIntimacyState(
  state: IntimacyState | undefined,
  now = Date.now(),
): IntimacyState {
  const base = state ? { ...state } : createInitialIntimacyState(now);
  const elapsedMinutes = Math.max(0, (now - base.updatedAt) / 60_000);
  if (elapsedMinutes <= 0) return base;
  const arousalDecay = Math.exp(-elapsedMinutes / 28);
  const driveDecay = Math.exp(-elapsedMinutes / 45);
  base.arousal = clampIntimacy(base.arousal * arousalDecay);
  base.initiativeDrive = clampIntimacy(base.initiativeDrive * driveDecay);
  if (
    base.lastInteractionAt &&
    now - base.lastInteractionAt > 45 * 60_000 &&
    !["paused", "normal"].includes(base.phase)
  ) {
    base.phase = "normal";
    base.interactionStatus = "inactive";
    base.activeScene = null;
  }
  base.updatedAt = now;
  return base;
}

function privateEnough(world: import("../world/world").WorldState) {
  return world.isAwake &&
    ["free", "resting"].includes(world.availability) &&
    ["bedroom", "living_room"].includes(world.currentLocation);
}

function neutralScene(phase: "intimate" | "high_intimacy", now: number): IntimacySceneState {
  return {
    sceneId: "scene.private.default",
    stageId: phase === "high_intimacy" ? "stage.high_intimacy" : "stage.intimate",
    privacy: "fully_private",
    startedAt: now,
    updatedAt: now,
  };
}

export function planIntimacyTurn(input: IntimacyTurnInput): IntimacyTurnResult {
  const previous = currentIntimacyState(input.previous, input.now);
  const gate = evaluateIntimacyHardGate(input.character, previous);
  const signal = input.signal;
  const strength = clampIntimacy(signal.strength);
  let state: IntimacyState = { ...previous };
  let action: IntimacyTurnAction = "none";

  const finish = (): IntimacyTurnResult => ({
    state: { ...state, updatedAt: input.now },
    action,
    changed:
      state.phase !== previous.phase ||
      state.interactionStatus !== previous.interactionStatus ||
      state.comfort !== previous.comfort ||
      state.interest !== previous.interest ||
      state.arousal !== previous.arousal ||
      state.initiativeDrive !== previous.initiativeDrive ||
      state.activeScene?.stageId !== previous.activeScene?.stageId ||
      state.cooldownUntil !== previous.cooldownUntil ||
      state.lastBoundaryAt !== previous.lastBoundaryAt ||
      state.lastInteractionAt !== previous.lastInteractionAt,
    gate,
  });

  const activeInteraction = previous.phase !== "normal" || previous.interactionStatus !== "inactive" || previous.activeScene !== null;
  const relevantBoundary = activeInteraction || signal.intimacyContext === true;

  // Stop/pause is absolute inside an intimate context and does not depend on
  // adult mode or prior consent. A generic standalone "стоп" in an unrelated
  // conversation must not silently mutate intimacy state.
  if (signal.kind === "stop" && relevantBoundary) {
    state.phase = "paused";
    state.interactionStatus = "stopped";
    state.arousal = clampIntimacy(state.arousal * 0.18);
    state.initiativeDrive = 0;
    state.activeScene = null;
    state.cooldownUntil = input.now + 30 * 60_000;
    state.lastBoundaryAt = input.now;
    state.lastInteractionAt = input.now;
    action = "stop";
    return finish();
  }
  if (signal.kind === "pause" && relevantBoundary) {
    state.phase = "paused";
    state.interactionStatus = "paused";
    state.arousal = clampIntimacy(state.arousal * 0.35);
    state.initiativeDrive = 0;
    state.activeScene = null;
    state.cooldownUntil = input.now + 10 * 60_000;
    state.lastBoundaryAt = input.now;
    state.lastInteractionAt = input.now;
    action = "pause";
    return finish();
  }

  if (!gate.allowed) {
    action = signal.kind === "none" ? "none" : "gated";
    return finish();
  }

  const comfortBase = clampIntimacy(
    input.relationship.trust * 0.3 +
    input.relationship.closeness * 0.3 +
    input.relationship.security * 0.2 +
    input.emotion.affection * 0.2 -
    input.relationship.unresolvedTension * 0.38 -
    input.emotion.irritation * 0.22,
  );
  const interestBase = clampIntimacy(
    input.emotion.romanticInterest * 0.48 +
    input.emotion.affection * 0.28 +
    input.relationship.attachment * 0.16 +
    input.emotion.energy * 0.08,
  );
  state.comfort = clampIntimacy(state.comfort * 0.68 + comfortBase * 0.32);
  state.interest = clampIntimacy(state.interest * 0.72 + interestBase * 0.28);

  if (signal.kind === "none") return finish();

  if (signal.kind === "aftercare") {
    state.phase = "aftercare";
    state.interactionStatus = "open";
    state.comfort = clampIntimacy(state.comfort + 0.08 * Math.max(0.5, strength));
    state.arousal = clampIntimacy(state.arousal * 0.42);
    state.initiativeDrive = 0;
    state.activeScene = null;
    state.lastInteractionAt = input.now;
    action = "aftercare";
    return finish();
  }

  if (signal.kind === "hesitant") {
    state.phase = intimacyPhaseRank(state.phase) > intimacyPhaseRank("close") ? "close" : state.phase;
    state.interactionStatus = "hesitant";
    state.arousal = clampIntimacy(state.arousal * 0.55);
    state.initiativeDrive = 0;
    state.activeScene = null;
    state.lastInteractionAt = input.now;
    action = "check_in";
    return finish();
  }

  if (signal.kind === "resume") {
    const wasPaused = state.phase === "paused" || ["paused", "stopped"].includes(state.interactionStatus);
    if (!wasPaused) return finish();
    const canResume =
      input.now >= (state.cooldownUntil ?? 0) &&
      state.comfort >= 0.45 &&
      input.relationship.unresolvedTension < 0.42;
    if (!canResume) {
      state.interactionStatus = "hesitant";
      action = "check_in";
      return finish();
    }
    state.phase = "romantic";
    state.interactionStatus = "open";
    state.cooldownUntil = input.now;
    state.activeScene = null;
    state.lastInteractionAt = input.now;
    action = "resume";
    return finish();
  }

  const isPrivate = privateEnough(input.world);
  const unstable = input.relationship.unresolvedTension >= 0.45 ||
    input.emotion.irritation >= 0.5 || input.emotion.anxiety >= 0.72;
  if (unstable) {
    state.interactionStatus = "hesitant";
    state.initiativeDrive = 0;
    state.arousal = clampIntimacy(state.arousal * 0.7);
    action = "check_in";
    return finish();
  }

  if (signal.kind === "affection" || signal.kind === "flirt") {
    state.phase = nextIntimacyPhase(state.phase, "close");
    state.interactionStatus = "open";
    state.interest = clampIntimacy(state.interest + 0.06 * strength);
    state.arousal = clampIntimacy(state.arousal + (signal.kind === "flirt" ? 0.08 : 0.03) * strength);
    state.initiativeDrive = clampIntimacy(state.initiativeDrive + 0.05 * strength);
    state.lastInteractionAt = input.now;
    action = "warmth";
    return finish();
  }

  if (signal.kind === "approach" || signal.kind === "consent") {
    // Affectionate physical approach (hugging, kissing, sitting closer) can
    // build closeness, but cannot by itself unlock mature phases. Reaching
    // intimate/high_intimacy requires a stronger current-turn consent signal.
    const ceiling: IntimacyPhase = signal.kind === "approach"
      ? "close"
      : !isPrivate
        ? "close"
        : state.comfort >= 0.68 && state.interest >= 0.62 && input.relationship.trust >= 0.62
          ? "high_intimacy"
          : state.comfort >= 0.5 && state.interest >= 0.48
            ? "intimate"
            : "close";
    state.phase = nextIntimacyPhase(state.phase, ceiling);
    state.interactionStatus = "open";
    state.interest = clampIntimacy(state.interest + 0.1 * strength);
    state.arousal = clampIntimacy(state.arousal + (signal.kind === "consent" ? 0.16 : 0.07) * strength);
    state.initiativeDrive = clampIntimacy(state.initiativeDrive + 0.07 * strength);
    state.lastInteractionAt = input.now;
    if (state.phase === "intimate" || state.phase === "high_intimacy")
      state.activeScene = neutralScene(state.phase, input.now);
    else state.activeScene = null;
    action = signal.kind === "consent" ? "reciprocate" : "approach";
    return finish();
  }

  return finish();
}
