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
    "gradual_build_matters",
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

export type IntimacyPace = "slow" | "responsive" | "bold";

export interface IntimacyMindState {
  active: boolean;
  tenderness: number;
  desire: number;
  caution: number;
  playfulness: number;
  confidence: number;
  conflicted: boolean;
  preferredPace: IntimacyPace;
  activePreferenceKeys: string[];
  inwardArousal: boolean;
  outwardArousal: boolean;
  wantsCloseness: boolean;
  wantsMore: boolean;
  reflection: string;
}

export interface IntimacyTurnInput {
  character: CharacterCore;
  previous?: IntimacyState;
  preferences?: IntimacyPreferencesDocument;
  signal: IntimacySignal;
  emotion: import("../emotions/emotions").EmotionalState;
  relationship: import("../relationship/relationship").RelationshipState;
  world: import("../world/world").WorldState;
  now: number;
}

export interface IntimacyPreferenceLearningInput {
  before: IntimacyState;
  after: IntimacyState;
  signal: IntimacySignal;
  eventId: string;
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

const CORE_INTIMACY_PREFERENCES: ReadonlyArray<{
  topicKey: string;
  stance: IntimacyPreferenceStance;
  strength: number;
  confidence: number;
}> = [
  { topicKey: "emotional_closeness_matters", stance: "like", strength: 0.9, confidence: 0.96 },
  { topicKey: "privacy_matters", stance: "like", strength: 0.92, confidence: 0.98 },
  { topicKey: "reciprocity_matters", stance: "like", strength: 0.94, confidence: 0.98 },
  { topicKey: "gradual_build_matters", stance: "like", strength: 0.78, confidence: 0.9 },
];

function intimacyPreferenceWeight(
  preferences: IntimacyPreferencesDocument | undefined,
  topicKey: string,
  fallback = 0,
) {
  const item = preferences?.items
    .filter((entry) => entry.topicKey === topicKey && entry.validUntil === undefined)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!item) return fallback;
  const direction = item.stance === "like" ? 1 : item.stance === "dislike" ? -1 : 0;
  return direction * clampIntimacy(item.strength) * clampIntimacy(item.confidence);
}

export function ensureCoreIntimacyPreferences(
  document: IntimacyPreferencesDocument | undefined,
  now = Date.now(),
): { document: IntimacyPreferencesDocument; changed: boolean } {
  const base = document ? { ...document, items: document.items.map((item) => ({ ...item, sourceEventIds: [...item.sourceEventIds] })) } : createInitialIntimacyPreferences(now);
  const items = [...base.items];
  let changed = false;
  for (const core of CORE_INTIMACY_PREFERENCES) {
    const active = items.find((item) => item.topicKey === core.topicKey && item.validUntil === undefined);
    if (active) continue;
    items.push({
      id: `pref_core_${core.topicKey}`,
      topicKey: core.topicKey,
      stance: core.stance,
      strength: core.strength,
      confidence: core.confidence,
      origin: "core",
      sourceEventIds: ["core.intimacy_profile"],
      createdAt: now,
      updatedAt: now,
      validFrom: now,
    });
    changed = true;
  }
  return {
    document: changed ? { ...base, items, updatedAt: now } : base,
    changed,
  };
}

function reinforceLearnedPreference(
  items: IntimacyPreference[],
  topicKey: string,
  strength: number,
  eventId: string,
  now: number,
) {
  const active = items.find((item) => item.topicKey === topicKey && item.validUntil === undefined);
  if (!active) {
    items.push({
      id: `pref_${topicKey}_${now}`,
      topicKey,
      stance: "like",
      strength: clampIntimacy(strength),
      confidence: 0.34,
      origin: "learned",
      sourceEventIds: [eventId],
      createdAt: now,
      updatedAt: now,
      validFrom: now,
    });
    return true;
  }
  if (active.origin === "core") return false;
  const nextStrength = clampIntimacy(active.strength * 0.78 + strength * 0.22);
  const nextConfidence = clampIntimacy(active.confidence + 0.075);
  const sourceEventIds = [...new Set([...active.sourceEventIds, eventId])].slice(-10);
  const changed = Math.abs(nextStrength - active.strength) > 0.001 || Math.abs(nextConfidence - active.confidence) > 0.001 || !active.sourceEventIds.includes(eventId);
  if (!changed) return false;
  active.strength = nextStrength;
  active.confidence = nextConfidence;
  active.sourceEventIds = sourceEventIds;
  active.updatedAt = now;
  return true;
}

export function evolveIntimacyPreferences(
  document: IntimacyPreferencesDocument | undefined,
  input: IntimacyPreferenceLearningInput,
): { document: IntimacyPreferencesDocument; changed: boolean } {
  if (!input.after.adultModeEnabled) {
    return { document: document ?? createInitialIntimacyPreferences(input.now), changed: false };
  }
  const seeded = ensureCoreIntimacyPreferences(document, input.now);
  const next: IntimacyPreferencesDocument = {
    ...seeded.document,
    items: seeded.document.items.map((item) => ({ ...item, sourceEventIds: [...item.sourceEventIds] })),
  };
  let changed = seeded.changed;
  const positiveSafety = input.after.comfort >= 0.48 && input.after.interest >= 0.42 &&
    !["paused", "stopped", "hesitant"].includes(input.after.interactionStatus);
  if (positiveSafety && input.signal.kind === "flirt")
    changed = reinforceLearnedPreference(next.items, "playful_teasing", Math.max(input.after.interest, input.after.arousal * 0.8), input.eventId, input.now) || changed;
  if (positiveSafety && ["affection", "approach"].includes(input.signal.kind))
    changed = reinforceLearnedPreference(next.items, "affectionate_closeness", Math.max(input.after.comfort, input.after.interest * 0.85), input.eventId, input.now) || changed;
  if (positiveSafety && input.signal.kind === "consent" && input.after.arousal >= 0.58)
    changed = reinforceLearnedPreference(next.items, "direct_desire", Math.max(input.after.arousal, input.after.interest), input.eventId, input.now) || changed;
  if (input.signal.kind === "aftercare" && input.after.comfort >= 0.52)
    changed = reinforceLearnedPreference(next.items, "aftercare_closeness", input.after.comfort, input.eventId, input.now) || changed;
  if (changed) next.updatedAt = input.now;
  return { document: next, changed };
}

export function buildIntimacyMind(input: {
  state: IntimacyState;
  preferences?: IntimacyPreferencesDocument;
  signal?: IntimacySignal;
  emotion: import("../emotions/emotions").EmotionalState;
  relationship: import("../relationship/relationship").RelationshipState;
  world: import("../world/world").WorldState;
}): IntimacyMindState {
  const { state, preferences, emotion, relationship, world } = input;
  const active = state.adultModeEnabled && (
    state.phase !== "normal" || state.interactionStatus !== "inactive" || Boolean(input.signal?.intimacyContext)
  );
  const reciprocal = Math.max(0, intimacyPreferenceWeight(preferences, "reciprocity_matters", 0.9));
  const gradual = Math.max(0, intimacyPreferenceWeight(preferences, "gradual_build_matters", 0.55));
  const playfulPreference = Math.max(0, intimacyPreferenceWeight(preferences, "playful_teasing", 0));
  const closenessPreference = Math.max(0, intimacyPreferenceWeight(preferences, "affectionate_closeness", 0.2));
  const directPreference = Math.max(0, intimacyPreferenceWeight(preferences, "direct_desire", 0));
  const aftercarePreference = Math.max(0, intimacyPreferenceWeight(preferences, "aftercare_closeness", 0.2));
  const tenderness = clampIntimacy(
    emotion.affection * 0.46 + state.comfort * 0.34 + relationship.closeness * 0.14 + closenessPreference * 0.06 +
    (state.phase === "aftercare" ? 0.12 + aftercarePreference * 0.08 : 0),
  );
  const desire = clampIntimacy(state.interest * 0.36 + state.arousal * 0.4 + emotion.romanticInterest * 0.18 + directPreference * 0.06);
  const pressureRisk = input.signal?.kind === "hesitant" || ["paused", "stopped", "hesitant"].includes(state.interactionStatus) ? 0.72 : 0;
  const privacyMismatch = !privateEnough(world) && intimacyPhaseRank(state.phase) >= intimacyPhaseRank("close")
    ? Math.max(0, intimacyPreferenceWeight(preferences, "privacy_matters", 0.88)) * 0.35
    : 0;
  const caution = clampIntimacy(
    relationship.unresolvedTension * 0.42 + emotion.anxiety * 0.2 + emotion.irritation * 0.18 + pressureRisk + privacyMismatch +
    Math.max(0, desire - state.comfort) * 0.24,
  );
  const playfulness = clampIntimacy(
    emotion.happiness * 0.2 + emotion.energy * 0.16 + state.interest * 0.28 + playfulPreference * 0.36,
  );
  const confidence = clampIntimacy(state.comfort * 0.48 + relationship.trust * 0.3 + reciprocal * 0.12 + (1 - caution) * 0.1);
  const conflicted = active && desire >= 0.48 && caution >= 0.42;
  const preferredPace: IntimacyPace = caution > 0.58 || gradual > 0.9
    ? "slow"
    : directPreference > 0.5 && confidence > 0.62
      ? "bold"
      : "responsive";
  const bonded =
    (relationship.closeness >= 0.38 && relationship.trust >= 0.38) ||
    (state.comfort >= 0.48 && state.interest >= 0.5);
  const inwardArousal = active && state.arousal >= 0.4 && bonded;
  const outwardArousal = active && bonded &&
    state.arousal >= 0.62 && state.comfort >= 0.48 && state.interest >= 0.5 &&
    caution < 0.5 && !["paused", "stopped", "hesitant"].includes(state.interactionStatus);
  const wantsCloseness = active && tenderness >= 0.52 && caution < 0.72;
  const wantsMore = active && desire >= 0.6 && confidence >= 0.56 && caution < 0.46;
  const activePreferenceKeys = (preferences?.items ?? [])
    .filter((item) => item.validUntil === undefined && item.stance === "like" && item.confidence >= 0.4)
    .sort((a, b) => b.confidence * b.strength - a.confidence * a.strength)
    .slice(0, 6)
    .map((item) => item.topicKey);
  const reflection = !active
    ? "Intimacy is not currently active in her attention."
    : conflicted
      ? "Desire is present, but caution and mutual comfort matter more than momentum."
      : state.phase === "aftercare"
        ? "Tenderness and emotional closeness are more important than escalation right now."
        : outwardArousal
          ? "The attraction is strong enough that it can show in her wording and teasing. She can admit being affected, but it is still not automatic consent to any next step."
          : inwardArousal
            ? "She is genuinely aroused internally, though she may show it only as being flustered, bolder, or more teasing depending on confidence."
            : wantsMore
              ? "She wants more closeness and feels safe enough to show that desire without treating it as automatic consent."
              : wantsCloseness
                ? "She wants closeness, but prefers to let the interaction build rather than force a next step."
                : "She notices the intimate context but is not trying to escalate it.";
  return {
    active, tenderness, desire, caution, playfulness, confidence, conflicted, preferredPace,
    activePreferenceKeys, inwardArousal, outwardArousal, wantsCloseness, wantsMore, reflection,
  };
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
  const emotionalClosenessPreference = Math.max(0, intimacyPreferenceWeight(input.preferences, "emotional_closeness_matters", 0.88));
  const reciprocityPreference = Math.max(0, intimacyPreferenceWeight(input.preferences, "reciprocity_matters", 0.9));
  const gradualPreference = Math.max(0, intimacyPreferenceWeight(input.preferences, "gradual_build_matters", 0.72));
  const playfulPreference = Math.max(0, intimacyPreferenceWeight(input.preferences, "playful_teasing", 0));
  const directPreference = Math.max(0, intimacyPreferenceWeight(input.preferences, "direct_desire", 0));
  const interestBase = clampIntimacy(
    input.emotion.romanticInterest * 0.45 +
    input.emotion.affection * 0.25 +
    input.relationship.attachment * 0.14 +
    input.emotion.energy * 0.06 +
    emotionalClosenessPreference * 0.06 +
    playfulPreference * 0.025 +
    directPreference * 0.015,
  );
  state.comfort = clampIntimacy(state.comfort * 0.68 + (comfortBase + emotionalClosenessPreference * 0.045 + reciprocityPreference * 0.025) * 0.32);
  state.interest = clampIntimacy(state.interest * 0.72 + interestBase * 0.28);
  const effectiveComfort = Math.max(state.comfort, comfortBase * 0.82);
  const effectiveInterest = Math.max(state.interest, interestBase * 0.82);

  if (signal.kind === "none") return finish();

  if (signal.kind === "aftercare") {
    state.phase = "aftercare";
    state.interactionStatus = "open";
    state.comfort = clampIntimacy(state.comfort + 0.12 * Math.max(0.5, strength));
    state.interest = clampIntimacy(state.interest + 0.025 * strength);
    state.arousal = clampIntimacy(state.arousal * 0.32);
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

    const bondHeat = clampIntimacy(
      input.relationship.closeness * 0.3 +
      input.relationship.trust * 0.24 +
      input.relationship.attachment * 0.18 +
      input.relationship.security * 0.1 +
      input.emotion.affection * 0.09 +
      input.emotion.romanticInterest * 0.09,
    );
    const mutuality = clampIntimacy(state.comfort * 0.5 + state.interest * 0.34 + bondHeat * 0.16);
    const closeEnoughForArousal =
      isPrivate &&
      effectiveComfort >= 0.28 &&
      effectiveInterest >= 0.3 &&
      input.relationship.unresolvedTension < 0.38 &&
      input.emotion.irritation < 0.44;

    state.comfort = clampIntimacy(
      state.comfort + (signal.kind === "affection" ? 0.055 : 0.028) * strength,
    );
    state.interest = clampIntimacy(
      state.interest +
        (signal.kind === "flirt" ? 0.09 + bondHeat * 0.035 : 0.052) * strength,
    );

    const affectionArousal = 0.024 * strength * (0.65 + mutuality * 0.35);
    const flirtArousal = closeEnoughForArousal
      ? (0.105 + bondHeat * 0.12) * strength * (0.72 + mutuality * 0.28)
      : (0.018 + bondHeat * 0.028) * strength;
    state.arousal = clampIntimacy(
      state.arousal + (signal.kind === "flirt" ? flirtArousal : affectionArousal),
    );

    const paceFactor = signal.kind === "flirt"
      ? 0.84 + playfulPreference * 0.2 + (closeEnoughForArousal ? bondHeat * 0.08 : 0)
      : 0.9 + emotionalClosenessPreference * 0.1;
    state.initiativeDrive = clampIntimacy(
      state.initiativeDrive +
        (signal.kind === "flirt" ? 0.1 : 0.05) *
          strength *
          (0.52 + mutuality * 0.48) *
          paceFactor *
          (1 - gradualPreference * 0.1),
    );

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
        : effectiveComfort >= 0.5 && effectiveInterest >= 0.5 && input.relationship.trust >= 0.35
          ? "high_intimacy"
          : effectiveComfort >= 0.32 && effectiveInterest >= 0.34
            ? "intimate"
            : "close";
    state.phase = nextIntimacyPhase(state.phase, ceiling);
    state.interactionStatus = "open";
    const mutuality = clampIntimacy(state.comfort * 0.58 + state.interest * 0.42);
    state.comfort = clampIntimacy(state.comfort + (signal.kind === "consent" ? 0.035 : 0.05) * strength);
    state.interest = clampIntimacy(state.interest + 0.1 * strength);
    state.arousal = clampIntimacy(state.arousal + (signal.kind === "consent" ? 0.22 : 0.085) * strength * (0.68 + mutuality * 0.32));
    const desireFactor = signal.kind === "consent" ? 0.9 + directPreference * 0.14 : 0.9;
    state.initiativeDrive = clampIntimacy(state.initiativeDrive + 0.105 * strength * (0.55 + mutuality * 0.45) * desireFactor * (1 - gradualPreference * 0.1));
    state.lastInteractionAt = input.now;
    if (state.phase === "intimate" || state.phase === "high_intimacy")
      state.activeScene = neutralScene(state.phase, input.now);
    else state.activeScene = null;
    action = signal.kind === "consent" ? "reciprocate" : "approach";
    return finish();
  }

  return finish();
}
