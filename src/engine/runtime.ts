import { defaultCharacter } from "../character/character";
import { createEvent, type CharacterEvent } from "../events/event-types";
import {
  applyEmotionDelta,
  decayEmotions,
  initialEmotionalState,
} from "../emotions/emotions";
import {
  applyRelationshipDelta,
  initialRelationshipState,
} from "../relationship/relationship";
import type { EmotionalState } from "../emotions/emotions";
import type { RelationshipState } from "../relationship/relationship";
import { getCompanionRepository } from "../storage/repository-factory";
import {
  applyWorldSimulationEmotion,
  createInitialWorldState,
  markUserInteraction,
  simulateWorld,
} from "../world/world";
import type { WorldState, WorldSimulationResult } from "../world/world";
import { describeWorldActivityDetail, worldClock } from "../world/world";
import { checkSignal } from "../core/async";
import type { ConversationCursor } from "../storage/repositories/interfaces";
import { renderCloudLanguage, type CloudConversationMetadata, type CloudLanguageResult } from "../ai/cloud-language";
import { createDefaultEditableContext, normalizeEditableContext } from "../context/yuzuki-context";

import { currentRomance, initialRomance, type RomanceState } from "../relationship/relationship";
import {
  buildIntimacyMind,
  createInitialIntimacyPreferences,
  createInitialIntimacyState,
  currentIntimacyState,
  evolveIntimacyPreferences,
  planIntimacyTurn,
  type IntimacyPreferencesDocument,
  type IntimacyState,
  type IntimacyTurnAction,
} from "../intimacy/intimacy";

import {
  parseActivitySceneId,
  parseSequenceSceneId,
  resolveVisualEmotionState,
  selectAmbientOrEmotionAppearance,
  selectAppearance,
  selectReadyToChatAppearance,
  selectSequenceAppearance,
  type AppearanceState,
} from "../avatar/avatar-model";
import { resolveAppearanceRequest } from "../avatar/appearance-request";

import {
  detectAppearanceRequest,
  detectExplicitSilenceRequest,
  detectIntimacySignal,
} from "../mechanics/turn-signals";
import type { IntimacySignal } from "../intimacy/intimacy";


export interface RuntimeState {
  appearance?: AppearanceState;
  romance?: RomanceState;
  intimacy?: IntimacyState;
  pendingWorldEvents?: CharacterEvent[];
  revision: number;
  emotion: EmotionalState;
  relationship: RelationshipState;
  world: WorldState;
}
export interface ConversationLine {
  id: string;
  role: "user" | "character";
  text: string;
  timestamp: number;
  proactive?: boolean;
  silent?: boolean;
  appearanceAssetId?: string;
  languageSource?: "gpt" | "local";
  languageReason?: string;
  conversationHint?: CloudConversationMetadata;
}
export interface RuntimeTrace {
  cloudLanguage?: CloudLanguageResult;
  intimacy?: { enabled: boolean; phase: IntimacyState["phase"]; action: string };
  appearanceRequest?: {
    requested: boolean;
    outcome: string;
    requestedVibe: string;
    selectedEmotion: string;
    reason: string;
  };
  mechanics?: {
    silenceRequested: boolean;
    intimacySignal: IntimacySignal["kind"];
    hardConstraint?: string;
    reactionSource?: "gpt" | "unchanged-fallback";
  };
  manualContext?: { personalityChars: number; memoryChars: number; recentMessages: number };
  timings?: { preflightMs: number; contextMs: number; generationMs: number; saveMs: number; totalMs: number; firstTextMs: number | null };
  maintenance?: Awaited<ReturnType<typeof maintainRuntime>>;
}
const repo = (uid: string | null, signal: AbortSignal) =>
  getCompanionRepository(defaultCharacter.id, uid, signal);
const SLEEP_WAKE_FOLLOWUP_MS = 10 * 60_000;
function worldEvents(simulation: WorldSimulationResult) {
  return simulation.generatedEvents.map((e) =>
    createEvent({
      id: `event_${e.id}`,
      type: "world",
      source: "system",
      timestamp: e.at,
      payload: {
        worldEventId: e.id,
        kind: e.kind,
        summary: e.summary,
        location: e.location,
        activity: e.activity,
        shareWorthiness: e.shareWorthiness,
        emotionalEffect: e.emotionalEffect,
      },
      importance: Math.min(0.8, 0.22 + e.shareWorthiness * 0.58),
    }),
  );
}
export function runtimeNow(state?: RuntimeState) {
  const floor = state
    ? Math.max(
        state.world.lastSimulatedAt,
        state.world.updatedAt,
        state.emotion.updatedAt,
        state.relationship.updatedAt,
      )
    : 0;
  return worldClock.now(floor);
}

function advance(state: RuntimeState, now = runtimeNow(state)) {
  const effectiveNow = Math.max(
    now,
    state.world.lastSimulatedAt,
    state.emotion.updatedAt,
    state.relationship.updatedAt,
  );
  const decayed = decayEmotions(state.emotion, effectiveNow);
  const relationship = applyRelationshipDelta(state.relationship, {}, effectiveNow);
  const simulation = simulateWorld(state.world, decayed, effectiveNow);
  return {
    state: {
      ...state,
      romance: currentRomance(state.romance, effectiveNow),
      intimacy: state.intimacy ? currentIntimacyState(state.intimacy, effectiveNow) : undefined,
      emotion: applyWorldSimulationEmotion(decayed, simulation, effectiveNow),
      relationship,
      world: simulation.world,
    },
    simulation,
  };
}

export function reconcileRuntimeState(
  state: RuntimeState,
  now = runtimeNow(state),
): RuntimeState {
  const advanced = advance(state, now);
  const pending = new Map(
    [
      ...(state.pendingWorldEvents ?? []),
      ...worldEvents(advanced.simulation),
    ].map((event) => [event.id, event]),
  );
  const reconciled = {
    ...advanced.state,
    pendingWorldEvents: [...pending.values()],
  };
  // World/activity can change while the app stays open. Keep the picture tied
  // to that world instead of leaving the last chat emotion frozen until reload.
  return normalizeAmbientAppearance(reconciled, [], now);
}
export function conversationFrom(events: CharacterEvent[]): ConversationLine[] {
  return events.flatMap((event): ConversationLine[] => {
    if ((event.type !== "message" && event.type !== "character_action") || event.source === "system")
      return [];
    const payload = event.payload as {
      text?: string;
      silent?: boolean;
      appearanceAssetId?: string;
      language?: {
        source?: string;
        reason?: string;
        conversation?: CloudConversationMetadata;
      };
    };
    const text = String(payload.text ?? "").trim();
    const silent = event.source === "character" && payload.silent === true;
    if (!text && !silent) return [];
    return [{
      id: event.id,
      role: event.source,
      text,
      timestamp: event.timestamp,
      proactive: event.type === "character_action",
      silent,
      appearanceAssetId: typeof payload.appearanceAssetId === "string" ? payload.appearanceAssetId : undefined,
      languageSource: payload.language?.source === "gpt" || payload.language?.source === "local"
        ? payload.language.source
        : undefined,
      languageReason: typeof payload.language?.reason === "string" ? payload.language.reason : undefined,
      conversationHint: payload.language?.conversation && typeof payload.language.conversation === "object"
        ? payload.language.conversation
        : undefined,
    }];
  });
}

function recentCharacterAppearanceIds(lines: ConversationLine[], limit = 6) {
  return lines
    .filter((line) => line.role === "character" && line.appearanceAssetId)
    .slice(-limit)
    .map((line) => line.appearanceAssetId!);
}

/**
 * Short-term dialogue window for GPT: keep both voices represented instead of
 * allowing a run of multi-bubble character messages to push the user side out.
 * The selected lines are returned in their original chronological order.
 */
export function selectBalancedRecentHistory(
  lines: readonly ConversationLine[],
  perRole = 15,
) {
  const users = lines.filter((line) => line.role === "user" && line.text.trim()).slice(-perRole);
  const characters = lines.filter((line) => line.role === "character" && line.text.trim()).slice(-perRole);
  const keep = new Set([...users, ...characters].map((line) => line.id));
  return lines
    .filter((line) => keep.has(line.id))
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

const EMOTION_REACTION_LIMITS = {
  happiness: 0.08,
  sadness: 0.08,
  irritation: 0.10,
  anxiety: 0.08,
  curiosity: 0.05,
  boredom: 0.05,
  affection: 0.025,
  romanticInterest: 0.02,
} as const;

const RELATIONSHIP_REACTION_LIMITS = {
  trust: 0.008,
  closeness: 0.010,
  attachment: 0.006,
  security: 0.012,
  respect: 0.008,
  unresolvedTension: 0.025,
} as const;

function normalizedReaction(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

/**
 * GPT judges the direction/relative strength of a social-emotional reaction.
 * The engine remains authoritative over inertia by scaling every normalized
 * request into a small per-turn delta. If cloud failed, no second semantic
 * interpreter invents an emotional reaction; only ordinary time/world decay applies.
 */
export function applyBoundedCloudReaction(
  emotion: EmotionalState,
  relationship: RelationshipState,
  cloud: CloudLanguageResult,
  now: number,
) {
  if (cloud.used && cloud.emotionReaction && cloud.relationshipReaction) {
    const emotionDelta = Object.fromEntries(
      Object.entries(EMOTION_REACTION_LIMITS).map(([key, limit]) => [
        key,
        normalizedReaction(cloud.emotionReaction?.[key as keyof typeof EMOTION_REACTION_LIMITS]) * limit,
      ]),
    );
    const relationshipDelta = Object.fromEntries(
      Object.entries(RELATIONSHIP_REACTION_LIMITS).map(([key, limit]) => [
        key,
        normalizedReaction(cloud.relationshipReaction?.[key as keyof typeof RELATIONSHIP_REACTION_LIMITS]) * limit,
      ]),
    );
    return {
      emotion: applyEmotionDelta(emotion, emotionDelta, now),
      relationship: applyRelationshipDelta(relationship, relationshipDelta, now),
      source: "gpt" as const,
    };
  }
  // If cloud is unavailable, do not let a second local interpretation layer
  // invent emotional meaning. Time/world decay still applies in advance().
  return {
    emotion,
    relationship,
    source: "unchanged-fallback" as const,
  };
}

const SX_TURN_PATTERN = /(поцел|целу|обними|раздень|возьми|ласкай|трогай|горяч|возбуд|секс|sex|эрот|интим|пошл|хочу тебя|давай продолжим|продолжай|кончи|конч)/iu;

function shouldTriggerSequence(
  signal: IntimacySignal,
  text: string,
  intimacy?: IntimacyState,
) {
  if (!intimacy?.adultModeEnabled) return false;
  const arousal = intimacy.arousal ?? 0;
  const highPhase = intimacy.phase === "intimate" || intimacy.phase === "high_intimacy";
  if (arousal < 0.72 && !highPhase) return false;
  if (["stop", "pause", "hesitant", "aftercare"].includes(signal.kind)) return false;
  if (["flirt", "approach", "consent", "resume"].includes(signal.kind)) return true;
  return signal.intimacyContext === true && SX_TURN_PATTERN.test(text);
}

const READY_TRANSITION_ACTIVITIES = new Set([
  "ready_to_chat",
  "putting_phone_away",
  "putting_book_away",
  "sitting_up",
]);

export function shouldShowReadyToChat(state: RuntimeState, now: number) {
  // A sleepy acknowledgement is not a wake-up transition. The first message
  // received while she is still asleep must never produce ready_to_chat.
  if (!state.world.isAwake || state.world.availability === "sleeping") return false;
  const currentActivityAsset = parseActivitySceneId(state.appearance?.assetId);
  const sinceLastInteraction = Math.max(0, now - state.world.lastUserInteractionAt);
  // ready_to_chat (and the small transition poses leading into it) are one-turn
  // bridges from ambient life into conversation. Once the world is already in
  // chatting mode they must yield to the emotion selector on the next turn.
  if (
    currentActivityAsset &&
    READY_TRANSITION_ACTIVITIES.has(currentActivityAsset.activity) &&
    state.world.currentActivity === "chatting" &&
    sinceLastInteraction <= 90_000
  ) return false;
  if (currentActivityAsset) return true;
  if (state.world.currentActivity !== "chatting") return true;
  return sinceLastInteraction > 90_000;
}

export function shouldHoldSequenceAppearance(state: RuntimeState, now: number) {
  const sequence = parseSequenceSceneId(state.appearance?.assetId);
  if (!sequence) return false;
  const intimacy = state.intimacy;
  if (!intimacy?.adultModeEnabled) return false;
  if (["paused", "stopped"].includes(intimacy.interactionStatus)) return false;
  const selectedAt = state.appearance?.selectedAt ?? 0;
  const age = Math.max(0, now - selectedAt);
  const lastIntimateInteraction = intimacy.lastInteractionAt ?? state.world.lastUserInteractionAt;
  const idleFor = Math.max(0, now - lastIntimateInteraction);
  const activeHeat =
    intimacy.arousal >= 0.72 ||
    intimacy.phase === "intimate" ||
    intimacy.phase === "high_intimacy";
  if (sequence.kind === "sxfin") {
    return age <= 120_000 && idleFor <= 180_000 && (activeHeat || intimacy.phase === "aftercare");
  }
  return activeHeat && age <= 10 * 60_000 && idleFor <= 5 * 60_000;
}

function normalizeAmbientAppearance(
  state: RuntimeState,
  history: ConversationLine[],
  now = runtimeNow(state),
): RuntimeState {
  if (shouldHoldSequenceAppearance(state, now)) return state;
  const sinceLastInteraction = Math.max(0, now - state.world.lastUserInteractionAt);
  if (state.world.currentActivity === "chatting" && sinceLastInteraction < 90_000 && state.appearance?.assetId)
    return state;
  const recentAssetIds = recentCharacterAppearanceIds(history);
  return {
    ...state,
    appearance: selectAmbientOrEmotionAppearance(state, now, {
      recentAssetIds,
      seed: `ambient|${state.world.currentActivity}|${state.world.timeOfDay}|${state.revision}`,
    }),
  };
}
export async function bootstrapRuntime(
  uid: string | null,
  signal: AbortSignal,
  now?: number,
) {
  const repository = repo(uid, signal);
  const wallNow = now ?? Date.now();
  const [{ snapshot: stored, world }, conversationPage, pendingTurns, storedIntimacy] = await Promise.all([
    repository.loadRuntimeState(),
    repository.listConversationEvents({ limit: 80 }),
    repository.listPendingTurns(100),
    repository.loadIntimacyState(),
  ]);
  checkSignal(signal);
  // Read-only bootstrap: a delayed startup cannot overwrite a newer conversation.
  const state: RuntimeState = {
    revision: stored?.revision ?? 0,
    romance: stored?.romance,
    intimacy: storedIntimacy ?? createInitialIntimacyState(wallNow),
    appearance: stored?.appearance,
    emotion: stored?.emotion ?? { ...initialEmotionalState, updatedAt: wallNow },
    relationship: stored?.relationship ?? {
      ...initialRelationshipState,
      updatedAt: wallNow,
    },
    world: world ?? createInitialWorldState(wallNow),
  };
  const effectiveNow = now ?? runtimeNow(state);
  const advanced = advance(state, effectiveNow);
  const recentConversation = conversationFrom(
    [...new Map(
      [...conversationPage.events, ...pendingTurns].map((event) => [event.id, event]),
    ).values()].sort(
      (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
    ),
  );
  const bootState = normalizeAmbientAppearance({
    ...advanced.state,
    pendingWorldEvents: worldEvents(advanced.simulation),
  }, recentConversation, effectiveNow);
  return {
    state: bootState,
    recentConversation,
    pendingTurnIds: pendingTurns.map((event) => event.id),
    historyCursor: conversationPage.nextCursor,
    hasOlderConversation: conversationPage.hasMore,
  };
}

export async function clearConversationAndMemory(
  uid: string | null,
  signal: AbortSignal,
  current: RuntimeState,
): Promise<RuntimeState> {
  const repository = repo(uid, signal);
  const now = runtimeNow(current);
  const emotion: EmotionalState = { ...initialEmotionalState, updatedAt: now };
  const relationship: RelationshipState = { ...initialRelationshipState, updatedAt: now };
  const romance = initialRomance(now);
  const intimacy = createInitialIntimacyState(now);
  const world = createInitialWorldState(now, current.world.timeZone);
  const persisted = await repository.resetConversationAndMemory(
    { emotion, relationship, romance },
    world,
  );
  checkSignal(signal);
  return {
    revision: persisted.snapshot?.revision ?? current.revision + 1,
    emotion: persisted.snapshot?.emotion ?? emotion,
    relationship: persisted.snapshot?.relationship ?? relationship,
    romance: persisted.snapshot?.romance ?? romance,
    intimacy,
    appearance: persisted.snapshot?.appearance,
    world: persisted.world ?? world,
  };
}

export async function dismissPendingTurn(
  uid: string | null,
  signal: AbortSignal,
  messageId: string,
) {
  const repository = repo(uid, signal);
  await repository.dismissPendingTurn(messageId);
  checkSignal(signal);
}

export async function loadOlderConversation(
  uid: string | null,
  signal: AbortSignal,
  before: ConversationCursor | null,
  limit = 60,
) {
  const repository = repo(uid, signal);
  const page = await repository.listConversationEvents({ before, limit });
  checkSignal(signal);
  return {
    messages: conversationFrom(page.events),
    historyCursor: page.nextCursor,
    hasOlderConversation: page.hasMore,
  };
}

export async function refreshRuntimeFromPersistence(
  uid: string | null,
  signal: AbortSignal,
  current: RuntimeState,
) {
  const repository = repo(uid, signal);
  const [{ snapshot, world }, intimacy] = await Promise.all([
    repository.loadRuntimeState(),
    repository.loadIntimacyState(),
  ]);
  checkSignal(signal);
  const revision = snapshot?.revision ?? current.revision;
  const stateChanged = Boolean(snapshot && world && revision > current.revision);
  const intimacyChanged = Boolean(intimacy && intimacy.revision > (current.intimacy?.revision ?? -1));
  if (!stateChanged && !intimacyChanged) return current;
  const refreshed = reconcileRuntimeState({
    pendingWorldEvents: current.pendingWorldEvents,
    revision: stateChanged ? revision : current.revision,
    romance: stateChanged ? snapshot!.romance : current.romance,
    intimacy: intimacyChanged ? intimacy! : current.intimacy,
    appearance: stateChanged ? snapshot!.appearance : current.appearance,
    emotion: stateChanged ? snapshot!.emotion : current.emotion,
    relationship: stateChanged ? snapshot!.relationship : current.relationship,
    world: stateChanged ? world! : current.world,
  });
  return normalizeAmbientAppearance(refreshed, [], runtimeNow(refreshed));
}

export async function setIntimacyAdultMode(
  uid: string | null,
  signal: AbortSignal,
  current: RuntimeState,
  enabled: boolean,
): Promise<RuntimeState> {
  const repository = repo(uid, signal);
  const now = runtimeNow(current);
  const stored = await repository.loadIntimacyState();
  checkSignal(signal);
  const base = currentIntimacyState(stored ?? current.intimacy ?? createInitialIntimacyState(now), now);
  if (base.adultModeEnabled === enabled) return { ...current, intimacy: base };
  const next: IntimacyState = enabled
    ? { ...base, adultModeEnabled: true, phase: "normal", interactionStatus: "inactive", updatedAt: now }
    : {
        ...base,
        adultModeEnabled: false,
        phase: "normal",
        interactionStatus: "inactive",
        arousal: 0,
        initiativeDrive: 0,
        activeScene: null,
        cooldownUntil: undefined,
        updatedAt: now,
      };
  const persisted = await repository.commitIntimacyState(next, base.revision);
  checkSignal(signal);
  return { ...current, intimacy: persisted };
}
export interface TurnInput {
  id: string;
  text: string;
  timestamp: number;
}
export interface TurnOptions {
  uid: string | null;
  signal: AbortSignal;
  history: ConversationLine[];
  onChunk?: (text: string) => void;
  onPhase?: (text: string) => void;
}
function compactReplyBubble(value: string, max = 1400) {
  const clean = value.replace(/\s+/gu, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max + 1);
  const boundary = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (boundary >= Math.floor(max * 0.55)) return slice.slice(0, boundary + 1).trim();
  return `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

const INTERNAL_LANGUAGE_LEAK_RE = /(?:openai|json\s*schema|system\s*prompt|local\s*brain|internal\s*state|внутренн(?:ий|ее)\s+(?:промпт|состояние)|системн(?:ый|ого)\s+промпт)/iu;

function fallbackReply(kind?: string) {
  if (kind === "sleeping") return "Мм… я ещё сплю. Я увидела сообщение, просто сейчас совсем сонная.";
  if (kind === "intimacy_stop") return "Хорошо, остановимся.";
  if (kind === "intimacy_pause") return "Хорошо, давай без спешки.";
  return "Я сейчас что-то туплю, секунду.";
}

function hardConstraintKind(
  world: WorldState,
  intimacyAction: IntimacyTurnAction,
  romancePhase: RomanceState["phase"],
  signal: IntimacySignal,
) {
  if (!world.isAwake || world.availability === "sleeping") return "sleeping";
  // The intimacy engine already decides whether a generic "стоп/подожди" is
  // actually about an active intimate interaction. A private romance scene is
  // also a real boundary-bearing scene even if the adult module itself is idle.
  const romanceBoundary = romancePhase !== "neutral";
  if (intimacyAction === "stop" || (romanceBoundary && signal.kind === "stop"))
    return "intimacy_stop";
  if (
    intimacyAction === "pause" ||
    intimacyAction === "check_in" ||
    (romanceBoundary && ["pause", "hesitant"].includes(signal.kind))
  ) return "intimacy_pause";
  return undefined;
}

function hardConstraintSummary(kind: string | undefined) {
  if (kind === "sleeping")
    return "Yuzuki сейчас спит. Ответ должен быть очень коротким и сонным; не изображай полностью бодрствующую беседу.";
  if (kind === "intimacy_stop")
    return "Пользователь явно остановил интимное взаимодействие. Сразу остановись, не уговаривай и не продолжай интимный тон.";
  if (kind === "intimacy_pause")
    return "Пользователь попросил паузу/медленнее или выражает явное сомнение. Снизь темп и не продавливай продолжение.";
  return undefined;
}

function cloudPartsOrFallback(cloud: CloudLanguageResult, kind?: string) {
  if (cloud.used) {
    const raw = cloud.messages?.length ? cloud.messages : cloud.text ? [cloud.text] : [];
    const parts = raw
      .map((part) => compactReplyBubble(String(part ?? "")))
      .filter(Boolean)
      .slice(0, 3);
    const joined = parts.join(" ");
    const hardMismatch =
      kind === "sleeping"
        ? joined.length > 320 || !/(?:спл|сонн|разбуд|мм|сон)/iu.test(joined)
        : kind === "intimacy_stop"
          ? !/(?:останов|стоп|не\s+буду|хорошо|понял|поняла|прекрат)/iu.test(joined)
          : kind === "intimacy_pause"
            ? !/(?:медлен|не\s+спеш|пауза|хорошо|спокойн|без\s+спеш)/iu.test(joined)
            : false;
    if (parts.length && !INTERNAL_LANGUAGE_LEAK_RE.test(joined) && !hardMismatch)
      return { parts, usedCloud: true };
  }
  if (kind) return { parts: [fallbackReply(kind)], usedCloud: false };
  const reason = cloud.reason?.trim() || "cloud-language-unavailable";
  // Local/dev/test environments may intentionally have no cloud transport. In
  // production Firebase mode, an unavailable GPT path is a transport failure,
  // not something Yuzuki should pretend was her own reply.
  if (!cloud.attempted && ["non-browser", "firebase-disabled", "local-route", "test-local"].includes(reason))
    return { parts: [fallbackReply(kind)], usedCloud: false };
  throw new Error(`Не удалось получить ответ Yuzuki от GPT: ${reason}. Нажми «Повторить».`);
}

function syncRomanceState(
  previous: RomanceState | undefined,
  emotion: EmotionalState,
  relationship: RelationshipState,
  intimacy: IntimacyState,
  intimacyAction: IntimacyTurnAction,
  signal: IntimacySignal,
  now: number,
) {
  const current = currentRomance(previous, now);
  let phase: RomanceState["phase"] = "neutral";
  if (
    (["stop", "pause", "check_in"].includes(intimacyAction) ||
      ["stop", "pause", "hesitant"].includes(signal.kind)) &&
    current.phase !== "neutral"
  ) phase = "paused";
  else if ((intimacyAction === "resume" || signal.kind === "resume") && current.phase === "paused") phase = "neutral";
  else if (current.phase === "paused") phase = "paused";
  else if (["paused", "stopped"].includes(intimacy.interactionStatus)) phase = "paused";
  else if (["intimate", "high_intimacy"].includes(intimacy.phase)) phase = "private";
  else if (current.phase === "private") phase = "private";
  else if (emotion.romanticInterest >= 0.52 && relationship.closeness >= 0.55) phase = "romantic";
  else if (emotion.romanticInterest >= 0.34 && emotion.happiness >= 0.44) phase = "playful";
  return {
    ...current,
    phase,
    pending: null,
    pendingUntil: 0,
    updatedAt: now,
  };
}

export async function handleUserMessage(
  input: TurnInput,
  current: RuntimeState,
  options: TurnOptions,
) {
  const started = performance.now();
  let firstTextMs: number | null = null;
  const publish = (text: string) => {
    checkSignal(options.signal);
    if (text && firstTextMs === null) firstTextMs = Math.round(performance.now() - started);
    options.onChunk?.(text);
  };
  const { uid, signal } = options;
  const repository = repo(uid, signal);
  const replyId = `reply_${input.id}`;

  options.onPhase?.("Проверяем сохранение…");
  const [existing, persisted, persistedIntimacy, persistedIntimacyPreferences] = await Promise.all([
    repository.getEvent(replyId),
    repository.loadRuntimeState(),
    repository.loadIntimacyState(),
    repository.loadIntimacyPreferences(),
  ]);
  checkSignal(signal);
  const preflightMs = Math.round(performance.now() - started);

  if (existing) {
    await repository.dismissPendingTurn(input.id);
    const boot = await bootstrapRuntime(uid, signal);
    const payload = existing.payload as { text?: string; silent?: boolean; appearanceAssetId?: string };
    const recoveredReplies = boot.recentConversation
      .filter((line) => line.role === "character" && (line.id === replyId || line.id.startsWith(`${replyId}_`)))
      .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    const replyMessages = recoveredReplies.length
      ? recoveredReplies
      : [{
          id: replyId,
          role: "character" as const,
          text: String(payload.text ?? ""),
          timestamp: existing.timestamp,
          silent: payload.silent === true,
          appearanceAssetId: typeof payload.appearanceAssetId === "string" ? payload.appearanceAssetId : undefined,
        }];
    return {
      reply: replyMessages.map((line) => line.text).join("\n"),
      replyMessages,
      silent: payload.silent === true,
      replyId,
      replyTimestamp: existing.timestamp,
      appearanceAssetId: typeof payload.appearanceAssetId === "string" ? payload.appearanceAssetId : undefined,
      state: boot.state,
      trace: null as RuntimeTrace | null,
    };
  }

  const { snapshot, world: latestWorld } = persisted;
  const base = snapshot
    ? {
        ...current,
        ...snapshot,
        revision: snapshot.revision ?? 0,
        romance: snapshot.romance,
        intimacy: persistedIntimacy ?? current.intimacy,
        appearance: snapshot.appearance,
        world: latestWorld ?? current.world,
      }
    : { ...current, intimacy: persistedIntimacy ?? current.intimacy };

  const now = runtimeNow(base);
  const advanced = advance(base, now);
  const before = advanced.state;
  const intimacyPreferences: IntimacyPreferencesDocument =
    persistedIntimacyPreferences ?? createInitialIntimacyPreferences(now);
  const userEvent = createEvent({
    id: input.id,
    type: "message",
    source: "user",
    timestamp: input.timestamp,
    payload: { text: input.text },
    importance: 0.35,
  });

  options.onPhase?.("Собираем контекст…");
  const contextStarted = performance.now();
  const historyPromise = base.revision !== current.revision
    ? repository.listConversationEvents({ limit: 80 }).then((page) => conversationFrom(page.events))
    : Promise.resolve(options.history);
  const [, history, storedEditableContext] = await Promise.all([
    repository.appendEvent(userEvent),
    historyPromise,
    repository.loadEditableContext(),
  ]);
  checkSignal(signal);
  const editableContext = normalizeEditableContext(
    storedEditableContext ?? createDefaultEditableContext(now),
    now,
  );
  const contextMs = Math.round(performance.now() - contextStarted);
  const stableHistory = history.filter((line) => line.id !== input.id);
  const recentHistory = selectBalancedRecentHistory(stableHistory, 15);

  const baseTurnWorld = before.world;
  const previousUserLine = [...stableHistory].reverse().find((line) => line.role === "user");
  const recentSleepPing = Boolean(
    baseTurnWorld.availability === "sleeping" &&
      previousUserLine &&
      now - previousUserLine.timestamp >= 0 &&
      now - previousUserLine.timestamp <= SLEEP_WAKE_FOLLOWUP_MS &&
      now - baseTurnWorld.lastUserInteractionAt >= 0 &&
      now - baseTurnWorld.lastUserInteractionAt <= SLEEP_WAKE_FOLLOWUP_MS,
  );
  const turnWorld: WorldState = recentSleepPing
    ? {
        ...baseTurnWorld,
        currentActivity: "chatting",
        availability: "free",
        isAwake: true,
        updatedAt: now,
      }
    : baseTurnWorld;

  const silenceRequested = detectExplicitSilenceRequest(input.text);
  const intimacySignal = detectIntimacySignal(input.text);
  const appearanceRequest = detectAppearanceRequest(input.text);
  let emotion = before.emotion;
  let relationship = before.relationship;

  const intimacy = planIntimacyTurn({
    character: defaultCharacter,
    previous: before.intimacy,
    preferences: intimacyPreferences,
    signal: intimacySignal,
    emotion,
    relationship,
    world: turnWorld,
    now,
  });
  const intimacyMind = buildIntimacyMind({
    state: intimacy.state,
    preferences: intimacyPreferences,
    signal: intimacySignal,
    emotion,
    relationship,
    world: turnWorld,
  });
  const constraintKind = hardConstraintKind(
    turnWorld,
    intimacy.action,
    currentRomance(before.romance, now).phase,
    intimacySignal,
  );
  const silent = silenceRequested;
  options.onPhase?.(silent ? "Она решила промолчать…" : "Она отвечает…");
  const generationStarted = performance.now();

  let romance = syncRomanceState(before.romance, emotion, relationship, intimacy.state, intimacy.action, intimacySignal, now);
  const visualRuntime: RuntimeState = {
    ...before,
    world: turnWorld,
    emotion,
    relationship,
    romance,
    intimacy: intimacy.state,
  };
  const baseVisualEmotion = resolveVisualEmotionState(visualRuntime, {
    intimacySignalKind: intimacySignal.kind,
    eventIntensity: intimacySignal.strength,
    hardConstraintKind: constraintKind,
  });
  const appearanceResolution = resolveAppearanceRequest(
    visualRuntime,
    baseVisualEmotion,
    appearanceRequest,
    input.id,
  );
  const recentAppearanceIds = recentCharacterAppearanceIds(stableHistory);
  const sequenceAppearance = shouldTriggerSequence(intimacySignal, input.text, intimacy.state)
    ? selectSequenceAppearance(visualRuntime, now, { recentAssetIds: recentAppearanceIds, seed: input.id })
    : null;
  const readyAppearance = !sequenceAppearance && shouldShowReadyToChat(visualRuntime, now)
    ? selectReadyToChatAppearance(visualRuntime, now, { recentAssetIds: recentAppearanceIds, seed: input.id })
    : null;
  let appearance = sequenceAppearance?.appearance ?? readyAppearance ?? selectAppearance(
    visualRuntime,
    appearanceResolution.visualEmotion,
    now,
    { recentAssetIds: recentAppearanceIds, seed: input.id },
  );
  const sceneMechanic = sequenceAppearance
    ? {
        mode: sequenceAppearance.kind === "sxfin" ? "sx_finish" : "sx_sequence",
        family: sequenceAppearance.kind,
        step: sequenceAppearance.step,
        maxStep: sequenceAppearance.maxStep,
        heat: sequenceAppearance.heat,
      }
    : readyAppearance
      ? {
          mode: "ready_to_chat",
          family: parseActivitySceneId(readyAppearance.assetId)?.activity ?? "ready_to_chat",
        }
      : undefined;

  let cloudLanguage: CloudLanguageResult = {
    attempted: false,
    used: false,
    reason: silent ? "explicit-silence" : "not-attempted",
  };
  let replyParts: string[] = [];

  if (!silent) {
    cloudLanguage = await renderCloudLanguage({
      mode: "reply",
      userText: input.text,
      personality: editableContext.personality,
      memory: editableContext.memory,
      sceneMechanic,
      appearanceRequest: appearanceResolution.requested
        ? {
            requestedVibe: appearanceResolution.requestedVibe,
            outcome: appearanceResolution.outcome,
            reason: appearanceResolution.reason,
            selectedEmotion: appearanceResolution.selectedEmotion,
            suggestive: appearanceResolution.suggestive,
          }
        : undefined,
      constraint: constraintKind
        ? {
            locked: true,
            kind: constraintKind,
            summary: hardConstraintSummary(constraintKind),
          }
        : undefined,
      world: {
        timeOfDay: turnWorld.timeOfDay,
        location: turnWorld.currentLocation,
        activity: turnWorld.currentActivity,
        availability: turnWorld.availability,
        isAwake: turnWorld.isAwake,
        connectionDrive: turnWorld.connectionDrive,
        activityDetail: describeWorldActivityDetail(turnWorld.currentActivity, now),
      },
      relationship: {
        stage: relationship.stage,
        trust: relationship.trust,
        closeness: relationship.closeness,
        attachment: relationship.attachment,
        security: relationship.security,
        respect: relationship.respect,
        unresolvedTension: relationship.unresolvedTension,
      },
      emotion: {
        mood: emotion.mood,
        energy: emotion.energy,
        happiness: emotion.happiness,
        sadness: emotion.sadness,
        irritation: emotion.irritation,
        anxiety: emotion.anxiety,
        curiosity: emotion.curiosity,
        boredom: emotion.boredom,
        affection: emotion.affection,
        romanticInterest: emotion.romanticInterest,
      },
      romancePhase: romance.phase,
      intimacy: {
        enabled: intimacy.state.adultModeEnabled,
        phase: intimacy.state.phase,
        interactionStatus: intimacy.state.interactionStatus,
        comfort: intimacy.state.comfort,
        interest: intimacy.state.interest,
        arousal: intimacy.state.arousal,
        initiativeDrive: intimacy.state.initiativeDrive,
        signal: {
          kind: intimacySignal.kind,
          strength: intimacySignal.strength,
          explicit: intimacySignal.explicit,
          intimacyContext: intimacySignal.intimacyContext === true,
        },
        mind: {
          active: intimacyMind.active,
          tenderness: intimacyMind.tenderness,
          desire: intimacyMind.desire,
          caution: intimacyMind.caution,
          playfulness: intimacyMind.playfulness,
          confidence: intimacyMind.confidence,
          conflicted: intimacyMind.conflicted,
          preferredPace: intimacyMind.preferredPace,
          inwardArousal: intimacyMind.inwardArousal,
          outwardArousal: intimacyMind.outwardArousal,
          wantsCloseness: intimacyMind.wantsCloseness,
          wantsMore: intimacyMind.wantsMore,
          activePreferenceKeys: intimacyMind.activePreferenceKeys,
          reflection: intimacyMind.reflection,
        },
      },
      recentHistory: recentHistory.map((line) => ({ role: line.role, text: line.text })),
      silent: false,
    }, signal);
    checkSignal(signal);
    const selected = cloudPartsOrFallback(cloudLanguage, constraintKind);
    replyParts = selected.parts;
    if (!selected.usedCloud && cloudLanguage.used) {
      cloudLanguage = { ...cloudLanguage, used: false, reason: "minimal-response-guard" };
    }
  }

  const stateReaction = applyBoundedCloudReaction(
    before.emotion,
    before.relationship,
    cloudLanguage,
    now,
  );
  emotion = stateReaction.emotion;
  relationship = stateReaction.relationship;
  romance = syncRomanceState(romance, emotion, relationship, intimacy.state, intimacy.action, intimacySignal, now);

  if (!sequenceAppearance && !readyAppearance && !appearanceResolution.requested) {
    const reactedVisualRuntime: RuntimeState = {
      ...visualRuntime,
      emotion,
      relationship,
      romance,
      intimacy: intimacy.state,
    };
    const reactedVisualEmotion = resolveVisualEmotionState(reactedVisualRuntime, {
      emotionTone: cloudLanguage.signals?.emotionTone,
      userTone: cloudLanguage.signals?.userTone,
      relationshipEvent: cloudLanguage.signals?.relationshipEvent,
      intimacySignalKind: intimacySignal.kind,
      eventIntensity: intimacySignal.strength,
      hardConstraintKind: constraintKind,
    });
    appearance = selectAppearance(
      reactedVisualRuntime,
      reactedVisualEmotion,
      now,
      { recentAssetIds: recentAppearanceIds, seed: `${input.id}:reaction` },
    );
  }

  const reply = replyParts.join("\n");
  const generationMs = Math.round(performance.now() - generationStarted);
  if (!silent) publish(reply);
  const replyTimestamp = runtimeNow({ ...before, emotion, relationship });
  const characterEvents = (silent ? [""] : replyParts).map((part, index, all) =>
    createEvent({
      id: index === 0 ? replyId : `${replyId}_${index + 1}`,
      type: "message",
      source: "character",
      timestamp: replyTimestamp + index * 700,
      payload: {
        text: part,
        memoryText: index === 0 && all.length > 1 ? reply : undefined,
        silent,
        inReplyTo: input.id,
        messagePart: { index: index + 1, count: all.length },
        romanceAction: index === 0 && ["intimacy_stop", "intimacy_pause"].includes(constraintKind ?? "") ? "pause" : "none",
        romancePhase: romance.phase,
        intimacyAction: index === 0 ? intimacy.action : "none",
        intimacyPhase: intimacy.state.phase,
        appearanceAssetId: appearance.assetId,
        language: {
          source: cloudLanguage.used ? "gpt" : "local",
          reason: cloudLanguage.used ? undefined : cloudLanguage.reason,
          model: cloudLanguage.model,
          conversation: cloudLanguage.used ? cloudLanguage.conversation : undefined,
        },
      },
      importance: index === 0 ? 0.35 : 0.2,
    }),
  );
  const world = markUserInteraction(turnWorld, replyTimestamp, {
    engaged: !silent && turnWorld.availability !== "sleeping",
  });

  options.onPhase?.("Сохраняем ответ…");
  const saveStarted = performance.now();
  try {
    await repository.commitTurn(
      [
        userEvent,
        ...characterEvents,
        ...new Map(
          [
            ...(current.pendingWorldEvents ?? []),
            ...worldEvents(advanced.simulation),
          ].map((event) => [event.id, event]),
        ).values(),
      ],
      { emotion, relationship, romance, appearance },
      world,
      base.revision,
    );
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "turn-already-committed") throw error;
    const saved = await repository.getEvent(replyId);
    const boot = await bootstrapRuntime(uid, signal);
    const savedPayload = saved!.payload as { text?: string; silent?: boolean; appearanceAssetId?: string };
    const savedReplies = boot.recentConversation
      .filter((line) => line.role === "character" && (line.id === replyId || line.id.startsWith(`${replyId}_`)))
      .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    return {
      reply: savedReplies.length ? savedReplies.map((line) => line.text).join("\n") : String(savedPayload.text ?? ""),
      replyMessages: savedReplies.length ? savedReplies : undefined,
      silent: savedPayload.silent === true,
      replyId,
      replyTimestamp: saved!.timestamp,
      appearanceAssetId: typeof savedPayload.appearanceAssetId === "string" ? savedPayload.appearanceAssetId : undefined,
      state: boot.state,
      trace: null,
    };
  }

  let savedIntimacy = intimacy.state;
  if (intimacy.changed) {
    try {
      savedIntimacy = await repository.commitIntimacyState(intimacy.state, intimacy.state.revision);
    } catch (error) {
      const latest = await repository.loadIntimacyState();
      if (latest) savedIntimacy = latest;
      else if (!(error instanceof Error && error.message.includes("intimacy-state-conflict"))) throw error;
    }
  }
  const evolvedIntimacyPreferences = evolveIntimacyPreferences(intimacyPreferences, {
    before: before.intimacy ?? createInitialIntimacyState(now),
    after: savedIntimacy,
    signal: intimacySignal,
    eventId: replyId,
    now: replyTimestamp,
  });
  if (evolvedIntimacyPreferences.changed) {
    try {
      await repository.commitIntimacyPreferences(
        evolvedIntimacyPreferences.document,
        intimacyPreferences.revision,
      );
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("intimacy-preferences-conflict"))) throw error;
    }
  }
  checkSignal(signal);

  const trace: RuntimeTrace = {
    timings: {
      preflightMs,
      contextMs,
      generationMs,
      saveMs: Math.round(performance.now() - saveStarted),
      totalMs: Math.round(performance.now() - started),
      firstTextMs,
    },
    cloudLanguage,
    intimacy: { enabled: savedIntimacy.adultModeEnabled, phase: savedIntimacy.phase, action: intimacy.action },
    appearanceRequest: {
      requested: appearanceResolution.requested,
      outcome: appearanceResolution.outcome,
      requestedVibe: appearanceResolution.requestedVibe,
      selectedEmotion: appearanceResolution.selectedEmotion,
      reason: appearanceResolution.reason,
    },
    mechanics: {
      silenceRequested,
      intimacySignal: intimacySignal.kind,
      hardConstraint: constraintKind,
      reactionSource: stateReaction.source,
    },
    manualContext: {
      personalityChars: editableContext.personality.length,
      memoryChars: editableContext.memory.length,
      recentMessages: recentHistory.length,
    },
  };

  return {
    reply,
    replyMessages: characterEvents.map((event) => ({
      id: event.id,
      role: "character" as const,
      text: String((event.payload as { text?: string }).text ?? ""),
      timestamp: event.timestamp,
      silent,
      appearanceAssetId: appearance.assetId,
      languageSource: cloudLanguage.used ? "gpt" as const : "local" as const,
      languageReason: cloudLanguage.used ? undefined : cloudLanguage.reason,
      conversationHint: cloudLanguage.used ? cloudLanguage.conversation : undefined,
    })),
    silent,
    replyId,
    replyTimestamp,
    appearanceAssetId: appearance.assetId,
    state: {
      emotion,
      relationship,
      world,
      romance,
      intimacy: savedIntimacy,
      appearance,
      revision: base.revision + 1,
    },
    trace,
  };
}
const PROACTIVE_MESSAGE_COOLDOWN_MS = 2 * 60 * 60_000;
const PROACTIVE_BLOCK_RECHECK_MS = 60 * 60_000;

function latestProactiveEvent(events: CharacterEvent[]) {
  return [...events]
    .reverse()
    .find((event) => event.type === "character_action" && event.source === "character");
}

export interface MaintenanceOptions {
  allowInitiative?: boolean;
  initiativeSignal?: AbortSignal;
  canSurfaceInitiative?: () => boolean;
}

export async function maintainRuntime(
  uid: string | null,
  signal: AbortSignal,
  state: RuntimeState,
  options: boolean | MaintenanceOptions = false,
) {
  const maintenanceOptions: MaintenanceOptions =
    typeof options === "boolean" ? { allowInitiative: options } : options;
  const allowInitiative = maintenanceOptions.allowInitiative === true;
  const initiativeSignal = maintenanceOptions.initiativeSignal ?? signal;
  const canSurfaceInitiative = maintenanceOptions.canSurfaceInitiative ?? (() => true);
  const repository = repo(uid, signal);
  // Immutable event writes are safe in idle work; never save an old mutable snapshot here.
  for (const event of state.pendingWorldEvents ?? []) {
    await repository.appendEvent(event);
  }
  checkSignal(signal);
  const maintenanceNow = runtimeNow(state);
  const advanced = advance(state, maintenanceNow);
  // v0.19.2: there is no local initiative topic queue anymore. The engine only
  // decides whether it is mechanically valid to CHECK for initiative; GPT then
  // decides whether Yuzuki actually wants to write and what she wants to say.
  const proactiveConversation = allowInitiative
    ? (await repository.listConversationEvents({ limit: 60 })).events
    : [];
  const lastProactive = latestProactiveEvent(proactiveConversation);
  const unansweredProactive = Boolean(
    lastProactive && lastProactive.timestamp > advanced.state.world.lastUserInteractionAt,
  );
  const proactiveCooldownOpen = !lastProactive ||
    maintenanceNow - lastProactive.timestamp >= PROACTIVE_MESSAGE_COOLDOWN_MS;
  let message: ConversationLine | null = null;
  let proactiveAppearance: AppearanceState | null = null;
  const quietMs = Math.max(0, maintenanceNow - advanced.state.world.lastUserInteractionAt);
  const initiativeWindowOpen = () =>
    allowInitiative &&
    !unansweredProactive &&
    proactiveCooldownOpen &&
    canSurfaceInitiative() &&
    !initiativeSignal.aborted &&
    advanced.state.world.isAwake &&
    !["sleeping", "occupied"].includes(advanced.state.world.availability) &&
    quietMs >= 10 * 60_000;

  if (initiativeWindowOpen()) {
    const [storedEditableContext, proactivePage] = await Promise.all([
      repository.loadEditableContext(),
      repository.listConversationEvents({ limit: 60 }),
    ]);
    const proactiveEditableContext = normalizeEditableContext(
      storedEditableContext ?? createDefaultEditableContext(maintenanceNow),
      maintenanceNow,
    );
    const proactiveHistory = conversationFrom(proactivePage.events);
    checkSignal(signal);

    if (initiativeWindowOpen()) {
      const proactiveLanguage = await renderCloudLanguage({
        mode: "initiative",
        userText: "",
        personality: proactiveEditableContext.personality,
        memory: proactiveEditableContext.memory,
        proactive: {
          kind: "autonomous_check",
          reason: "Проверка, есть ли у Yuzuki естественное желание самой выйти на связь.",
          quietMinutes: Math.round(quietMs / 60_000),
        },
        world: {
          timeOfDay: advanced.state.world.timeOfDay,
          location: advanced.state.world.currentLocation,
          activity: advanced.state.world.currentActivity,
          availability: advanced.state.world.availability,
          isAwake: advanced.state.world.isAwake,
          connectionDrive: advanced.state.world.connectionDrive,
          activityDetail: describeWorldActivityDetail(advanced.state.world.currentActivity, maintenanceNow),
        },
        relationship: {
          stage: advanced.state.relationship.stage,
          trust: advanced.state.relationship.trust,
          closeness: advanced.state.relationship.closeness,
          attachment: advanced.state.relationship.attachment,
          security: advanced.state.relationship.security,
          respect: advanced.state.relationship.respect,
          unresolvedTension: advanced.state.relationship.unresolvedTension,
        },
        emotion: {
          mood: advanced.state.emotion.mood,
          energy: advanced.state.emotion.energy,
          happiness: advanced.state.emotion.happiness,
          sadness: advanced.state.emotion.sadness,
          irritation: advanced.state.emotion.irritation,
          anxiety: advanced.state.emotion.anxiety,
          curiosity: advanced.state.emotion.curiosity,
          boredom: advanced.state.emotion.boredom,
          affection: advanced.state.emotion.affection,
          romanticInterest: advanced.state.emotion.romanticInterest,
        },
        romancePhase: advanced.state.romance?.phase,
        recentHistory: selectBalancedRecentHistory(proactiveHistory, 15).map((line) => ({
          role: line.role,
          text: line.text,
        })),
        silent: false,
      }, initiativeSignal);

      // A real user turn may have started while GPT was thinking. Re-check right
      // before persistence. A declined initiative intentionally writes nothing.
      if (
        proactiveLanguage.used &&
        proactiveLanguage.shouldInitiate === true &&
        proactiveLanguage.text &&
        initiativeWindowOpen()
      ) {
        const publishNow = runtimeNow(advanced.state);
        const publishState = advance(advanced.state, publishNow).state;
        if (
          publishState.world.isAwake &&
          !["sleeping", "occupied"].includes(publishState.world.availability)
        ) {
          const parts = (proactiveLanguage.messages?.length
            ? proactiveLanguage.messages
            : [proactiveLanguage.text])
            .map((part) => part.replace(/\s+/gu, " ").trim())
            .filter(Boolean)
            .slice(0, 3);
          if (parts.length) {
            const idBase = `proactive_auto_${publishNow}`;
            const proactiveVisualEmotion = resolveVisualEmotionState(publishState, {
              emotionTone: proactiveLanguage.signals?.emotionTone,
              relationshipEvent: proactiveLanguage.signals?.relationshipEvent,
            });
            proactiveAppearance = selectAppearance(
              publishState,
              proactiveVisualEmotion,
              publishNow,
              {
                recentAssetIds: recentCharacterAppearanceIds(proactiveHistory),
                seed: `${idBase}:initiative`,
              },
            );
            const events = parts.map((part, index) => createEvent({
              id: index === 0 ? idBase : `${idBase}_${index + 1}`,
              type: "character_action",
              source: "character",
              timestamp: publishNow + index * 700,
              payload: {
                text: part,
                initiativeId: idBase,
                messagePart: { index: index + 1, count: parts.length },
                appearanceAssetId: proactiveAppearance?.assetId,
                language: {
                  source: "gpt",
                  model: proactiveLanguage.model,
                  conversation: proactiveLanguage.conversation,
                },
              },
              importance: index === 0 ? 0.4 : 0.2,
            }));
            for (const event of events) await repository.appendEvent(event);
            message = {
              id: events[0].id,
              role: "character",
              text: parts.join("\n"),
              timestamp: events[0].timestamp,
              proactive: true,
              languageSource: "gpt",
              conversationHint: proactiveLanguage.conversation,
            };
          }
        }
      }
    }
  }
  return { message, appearance: proactiveAppearance };
}
