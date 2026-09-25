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
import {
  buildThought,
  decide,
  interpret,
  localPerception,
  planResponse,
} from "../cognition/local-cognition";
import { inferStateEffects } from "../cognition/state-effects";
import { getCompanionRepository } from "../storage/repository-factory";
import { guardCharacterReply, guardCloudCharacterReply } from "../dialogue/dialogue";
import { retrieveMemoryContext } from "../memory/retrieval";
import { recoverRecentMemory } from "../memory/memory-consolidation";
import { characterViewTopicKey, getMemoryHealth } from "../memory/model";
import {
  applyWorldSimulationEmotion,
  createInitialWorldState,
  markUserInteraction,
  simulateWorld,
} from "../world/world";
import type { WorldState, WorldSimulationResult } from "../world/world";
import { describeWorldActivityDetail, worldClock } from "../world/world";
import { refreshInitiatives, renderLocalInitiative, sanitizeProactiveDialogueText } from "../initiative/initiative";
import { checkSignal } from "../core/async";
import type { CompanionRepository, ConversationCursor } from "../storage/repositories/interfaces";
import { renderCloudLanguage, type CloudLanguageResult } from "../ai/cloud-language";

import { currentRomance, initialRomance, planRomance, type RomanceState } from "../relationship/relationship";
import {
  buildIntimacyMind,
  createInitialIntimacyPreferences,
  createInitialIntimacyState,
  currentIntimacyState,
  evolveIntimacyPreferences,
  planIntimacyTurn,
  type IntimacyPreferencesDocument,
  type IntimacyState,
} from "../intimacy/intimacy";

import {
  parseActivitySceneId,
  parseSequenceSceneId,
  resolveVisualEmotionState,
  selectAmbientAppearance,
  selectAppearance,
  selectReadyToChatAppearance,
  selectSequenceAppearance,
  type AppearanceState,
} from "../avatar/avatar-model";
import { resolveAppearanceRequest } from "../avatar/appearance-request";

import {
  analyzeLocalNLU,
  applyLocalNLUToPerception,
  detectLocalAppearanceRequest,
  applyRetrospectiveNLU,
  buildCausalRelations,
  buildDialogueContext,
  buildDialogueFrame,
  buildRetrospectiveContext,
  initiativeSemanticBridge,
  logLocalDialogueTrace,
  localDialogueRenderer,
  planAutonomousDialogue,
  planLocalDialogue,
  resolveContextualNLU,
  shouldUseRetrospectivePass,
  type DialogueAct,
  type LocalNLUResult,
  type RenderDebug,
} from "../local-dialogue/index";

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
  templateId?: string;
  dialogueActs?: DialogueAct[];
  appearanceAssetId?: string;
}
export interface RuntimeTrace {
  usedGeminiPerception: boolean;
  usedGeminiReply: boolean;
  responseGuardFallback?: boolean;
  responseGuardReason?: string;
  decision: ReturnType<typeof decide>;
  responsePlan: ReturnType<typeof planResponse>;
  nlu?: LocalNLUResult;
  localRenderer?: RenderDebug;
  cloudLanguage?: CloudLanguageResult;
  intimacy?: { enabled: boolean; phase: IntimacyState["phase"]; action: string };
  appearanceRequest?: {
    requested: boolean;
    outcome: string;
    requestedVibe: string;
    selectedEmotion: string;
    reason: string;
  };
  memoryContext: { memories: string[]; facts: string[]; openThreads: string[] };
  reasoning?: { retrospective: boolean; recovered: boolean; scannedLines: number; causalRelations: number };
  timings?: { preflightMs: number; contextMs: number; generationMs: number; saveMs: number; totalMs: number; firstTextMs: number | null };
  maintenance?: Awaited<ReturnType<typeof maintainRuntime>>;
}
const repo = (uid: string | null, signal: AbortSignal) =>
  getCompanionRepository(defaultCharacter.id, uid, signal);
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
  return {
    ...advanced.state,
    pendingWorldEvents: [...pending.values()],
  };
}
export function conversationFrom(events: CharacterEvent[]): ConversationLine[] {
  return events
    .flatMap((e): ConversationLine[] => {
      if (
        (e.type !== "message" && e.type !== "character_action") ||
        e.source === "system"
      )
        return [];
      const payload = e.payload as {
        text?: string;
        silent?: boolean;
        localDialogue?: { templateId?: string; dialogueActs?: string[] };
        appearanceAssetId?: string;
      };
      const rawText = String(payload?.text ?? "").trim();
      const text = e.type === "character_action"
        ? sanitizeProactiveDialogueText(rawText)
        : rawText;
      const silent = e.source === "character" && payload?.silent === true;
      const dialogueActs = Array.isArray(payload.localDialogue?.dialogueActs)
        ? payload.localDialogue.dialogueActs.filter((act) => typeof act === "string") as DialogueAct[]
        : undefined;
      return text || silent
        ? [
            {
              id: e.id,
              role: e.source,
              text,
              timestamp: e.timestamp,
              proactive: e.type === "character_action",
              silent,
              templateId: typeof payload.localDialogue?.templateId === "string" ? payload.localDialogue.templateId : undefined,
              dialogueActs,
              appearanceAssetId: typeof payload.appearanceAssetId === "string" ? payload.appearanceAssetId : undefined,
            },
          ]
        : [];
    });
}

function recentCharacterAppearanceIds(lines: ConversationLine[], limit = 6) {
  return lines
    .filter((line) => line.role === "character" && line.appearanceAssetId)
    .slice(-limit)
    .map((line) => line.appearanceAssetId!);
}

const SX_TURN_PATTERN = /(поцел|целу|обними|раздень|возьми|ласкай|трогай|горяч|возбуд|секс|sex|эрот|интим|пошл|хочу тебя|хочу тебя|давай продолжим|продолжай|кончи|конч)/iu;

function shouldTriggerSequence(
  nlu: LocalNLUResult,
  text: string,
  intimacy?: IntimacyState,
) {
  if (!intimacy?.adultModeEnabled) return false;
  const arousal = intimacy.arousal ?? 0;
  const highPhase = intimacy.phase === "intimate" || intimacy.phase === "high_intimacy";
  if (arousal < 0.72 && !highPhase) return false;
  const kind = nlu.semantic.intimacy.kind;
  if (["stop", "pause", "hesitant", "aftercare"].includes(kind)) return false;
  if (["flirt", "approach", "consent", "resume"].includes(kind)) return true;
  return nlu.semantic.intimacy.intimacyContext === true && SX_TURN_PATTERN.test(text);
}

function shouldShowReadyToChat(state: RuntimeState, now: number) {
  const currentActivityAsset = parseActivitySceneId(state.appearance?.assetId);
  if (currentActivityAsset) return true;
  if (state.world.currentActivity !== "chatting") return true;
  return Math.max(0, now - state.world.lastUserInteractionAt) > 90_000;
}

function normalizeAmbientAppearance(
  state: RuntimeState,
  history: ConversationLine[],
  now = runtimeNow(state),
): RuntimeState {
  if (parseSequenceSceneId(state.appearance?.assetId)) return state;
  const sinceLastInteraction = Math.max(0, now - state.world.lastUserInteractionAt);
  if (state.world.currentActivity === "chatting" && sinceLastInteraction < 90_000 && state.appearance?.assetId)
    return state;
  const ambient = selectAmbientAppearance(state, now, {
    recentAssetIds: recentCharacterAppearanceIds(history),
    seed: `ambient|${state.world.currentActivity}|${state.world.timeOfDay}|${state.revision}`,
  });
  return ambient ? { ...state, appearance: ambient } : state;
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
const RETROSPECTIVE_MAX_LINES = 720;

async function loadRetrospectiveConversation(
  repository: CompanionRepository,
  signal: AbortSignal,
  currentHistory: readonly ConversationLine[],
  excludeEventId: string,
) {
  const byId = new Map<string, ConversationLine>();
  for (const line of currentHistory) if (line.id !== excludeEventId) byId.set(line.id, line);
  let before: ConversationCursor | null = null;
  let hasMore = true;
  let pages = 0;
  let previousCursorKey = "";
  while (hasMore && byId.size < RETROSPECTIVE_MAX_LINES && pages < 6) {
    const page = await repository.listConversationEvents({ before, limit: 120 });
    checkSignal(signal);
    for (const line of conversationFrom(page.events)) {
      if (line.id !== excludeEventId) byId.set(line.id, line);
    }
    pages += 1;
    hasMore = page.hasMore;
    const next = page.nextCursor;
    const cursorKey = next ? `${next.timestamp}:${next.id}` : "";
    if (!next || cursorKey === previousCursorKey) break;
    previousCursorKey = cursorKey;
    before = next;
  }
  return [...byId.values()]
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
    .slice(-RETROSPECTIVE_MAX_LINES);
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
    const payload = existing.payload as {
      text?: string;
      silent?: boolean;
      localDialogue?: { templateId?: string; dialogueActs?: DialogueAct[] };
      appearanceAssetId?: string;
    };
    const recoveredReplies = boot.recentConversation
      .filter((line) =>
        line.role === "character" &&
        (line.id === replyId || line.id.startsWith(`${replyId}_`)),
      )
      .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    const replyMessages = recoveredReplies.length
      ? recoveredReplies
      : [{
          id: replyId,
          role: "character" as const,
          text: String(payload.text ?? ""),
          timestamp: existing.timestamp,
          silent: payload.silent === true,
          templateId: payload.localDialogue?.templateId,
          dialogueActs: payload.localDialogue?.dialogueActs,
          appearanceAssetId: typeof payload.appearanceAssetId === "string" ? payload.appearanceAssetId : undefined,
        }];
    return {
      reply: replyMessages.map((line) => line.text).join("\n"),
      replyMessages,
      silent: payload.silent === true,
      replyId,
      replyTimestamp: existing.timestamp,
      appearanceAssetId: typeof payload.appearanceAssetId === "string" ? payload.appearanceAssetId : undefined,
      renderMeta: payload.localDialogue
        ? {
            templateId: payload.localDialogue.templateId,
            dialogueActs: payload.localDialogue.dialogueActs,
          }
        : undefined,
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
  options.onPhase?.("Вспоминаем разговор…");
  const contextStarted = performance.now();
  // Short follow-ups rarely contain enough words to retrieve the right durable
  // memory on their own ("точно?", "а он?", "почему?"). Use the two most
  // recent surface turns as retrieval context without treating them as new facts.
  const memoryQuery = input.text.trim().split(/\s+/u).filter(Boolean).length <= 8
    ? [...options.history.slice(-2).map((line) => line.text), input.text]
        .filter(Boolean)
        .join("\n")
    : input.text;
  const [, memoryContext, history] = await Promise.all([
    repository.appendEvent(userEvent),
    retrieveMemoryContext(memoryQuery, repository, now),
    base.revision !== current.revision
      ? repository.listConversationEvents({ limit: 80 }).then(page => conversationFrom(page.events))
      : Promise.resolve(options.history),
  ]);
  checkSignal(signal);
  let contextMs = Math.round(performance.now() - contextStarted);
  memoryContext.memories = memoryContext.memories.filter(
    (m) => !m.sourceEventIds.includes(input.id),
  );
  memoryContext.facts = memoryContext.facts.filter(
    (f) => !f.sourceEventIds.includes(input.id),
  );
  const historyForDialogue = history.slice(-24).map((line) => ({
    id: line.id,
    role: line.role,
    text: line.text,
    timestamp: line.timestamp,
    templateId: line.templateId,
    dialogueActs: line.dialogueActs,
  }));
  const initialNlu = analyzeLocalNLU(input.text);
  const initialFrame = buildDialogueFrame(historyForDialogue, initialNlu);
  let nlu = resolveContextualNLU(initialNlu, initialFrame, input.text);
  let dialogueFrame = buildDialogueFrame(historyForDialogue, nlu);
  let retrospective: ReturnType<typeof buildRetrospectiveContext> | undefined;
  let reasoningHistory = historyForDialogue;
  if (shouldUseRetrospectivePass(nlu, dialogueFrame, input.text)) {
    options.onPhase?.("Перечитываем контекст…");
    const retrospectiveConversation = await loadRetrospectiveConversation(repository, signal, history, input.id);
    const retrospectiveHistory = retrospectiveConversation.map((line) => ({
      id: line.id, role: line.role, text: line.text, timestamp: line.timestamp,
      templateId: line.templateId, dialogueActs: line.dialogueActs,
    }));
    retrospective = buildRetrospectiveContext(retrospectiveHistory, nlu, dialogueFrame, input.text);
    nlu = applyRetrospectiveNLU(nlu, retrospective, input.text);
    dialogueFrame = buildDialogueFrame(historyForDialogue, nlu);
    reasoningHistory = retrospectiveHistory;
    contextMs = Math.round(performance.now() - contextStarted);
  }
  const causalRelations = buildCausalRelations(reasoningHistory, input.text);
  const currentCausal = causalRelations.find((relation) => relation.sourceId === "current-turn");
  const causalFocus = currentCausal ?? retrospective?.causalRelations[0];
  const previousNlu = dialogueFrame.previousUserText
    ? analyzeLocalNLU(dialogueFrame.previousUserText)
    : undefined;
  const counterArgumentCue = nlu.isQuestion && /(?:разве|но\s+ведь|с\s+другой\s+стороны|а\s+если)/iu.test(input.text);
  const continuityFocus = nlu.semantic.focus ?? (
    ["ask_followup", "reference_previous_topic", "ask_character_opinion", "ask_character_preference", "ask_why"].includes(nlu.intent) || counterArgumentCue
      ? previousNlu?.semantic.focus
      : undefined
  );
  const needsSelfContinuity = Boolean(
    continuityFocus && (
      nlu.semantic.asksCharacterView || counterArgumentCue ||
      ["ask_character_opinion", "ask_character_preference", "ask_for_opinion", "ask_followup", "reference_previous_topic", "ask_why"].includes(nlu.intent) ||
      ["believe", "like", "dislike", "change_mind"].includes(nlu.semantic.stance)
    )
  );
  if (needsSelfContinuity && continuityFocus) {
    const key = characterViewTopicKey(continuityFocus);
    if (key) {
      const neededKeys = [`character.opinion.${key}`, `character.tension.${key}`]
        .filter((factKey) => !memoryContext.facts.some((fact) => fact.status === "active" && fact.key === factKey));
      if (neededKeys.length) {
        const continuityFacts = (await Promise.all(
          neededKeys.map((factKey) => repository.listKnowledgeFacts({ key: factKey, statuses: ["active"], limit: 4 })),
        )).flat();
        const mergedFacts = new Map(memoryContext.facts.map((fact) => [fact.id, fact]));
        for (const fact of continuityFacts) mergedFacts.set(fact.id, fact);
        memoryContext.facts = [...mergedFacts.values()];
        checkSignal(signal);
      }
    }
  }
  const perception = applyLocalNLUToPerception(
    localPerception(
      input.text,
      history.slice(-6).map((line) => ({ role: line.role, text: line.text })),
    ),
    nlu,
  );
  const interpretation = interpret(
    perception,
    memoryContext,
    before.emotion,
    before.relationship,
  );
  const preliminary = decide(
    defaultCharacter,
    perception,
    interpretation,
    before.emotion,
    before.relationship,
    before.world,
  );
  const appearanceRequest = detectLocalAppearanceRequest(input.text);
  const effects = inferStateEffects(
    perception,
    preliminary,
    nlu.intent,
    before.emotion,
    before.relationship,
    appearanceRequest,
  );
  const emotion = applyEmotionDelta(before.emotion, effects.emotion, now);
  const relationship = applyRelationshipDelta(
    before.relationship,
    effects.relationship,
    now,
  );
  const intimacy = planIntimacyTurn({
    character: defaultCharacter,
    previous: before.intimacy,
    preferences: intimacyPreferences,
    signal: nlu.semantic.intimacy,
    emotion,
    relationship,
    world: before.world,
    now,
  });
  const intimacyMind = buildIntimacyMind({
    state: intimacy.state,
    preferences: intimacyPreferences,
    signal: nlu.semantic.intimacy,
    emotion,
    relationship,
    world: before.world,
  });
  const thought = buildThought(
    defaultCharacter,
    perception,
    interpretation,
    emotion,
    relationship,
    memoryContext,
    {
      userText: input.text,
      previousUserText: dialogueFrame.previousUserText,
      topic: nlu.topic ?? dialogueFrame.previousTopic,
      focus: continuityFocus,
      semanticStance: nlu.semantic.stance,
      reason: nlu.semantic.reason,
      sentiment: nlu.sentiment,
      asksCharacterView: nlu.semantic.asksCharacterView ||
        ["ask_character_opinion", "ask_character_preference", "ask_for_opinion"].includes(nlu.intent),
      negation: nlu.negation,
      meaningfulTokens: nlu.semantic.meaningfulTokens,
      intimacyMind,
      causalCause: causalFocus?.cause,
      causalEffect: causalFocus?.effect,
      causalRelation: causalFocus?.kind,
      causalConfidence: causalFocus?.confidence,
      retrospectiveEcho: retrospective?.summary,
      retrospectiveRecovered: retrospective?.recovered === true,
    },
  );
  let decision = decide(
    defaultCharacter,
    perception,
    interpretation,
    emotion,
    relationship,
    before.world,
    thought,
  );
  let responsePlan = planResponse(
    defaultCharacter,
    perception,
    interpretation,
    decision,
    emotion,
    before.world,
  );
  const romance = planRomance({ text: input.text, previous: before.romance, now,
    character: defaultCharacter, emotion, relationship,
    world: before.world, decision, plan: responsePlan });
  decision = romance.decision;
  responsePlan = romance.plan;
  if (before.world.availability === "sleeping" && decision.action === "stay_silent" && decision.content.mode !== "silence") {
    const sleepyReply = "Мм… я ещё сплю. Я увидела сообщение, просто сейчас совсем сонная.";
    decision = {
      ...decision,
      action: "acknowledge",
      tone: "sleepy_soft",
      shouldAskFollowUp: false,
      content: {
        ...decision.content,
        mode: "support",
        summary: "Короткая сонная реакция вместо полного молчания.",
        locked: true,
        fallbackText: sleepyReply,
      },
    };
    responsePlan = {
      ...responsePlan,
      intent: "acknowledge",
      tone: "sleepy_soft",
      length: "very_short",
      questionMode: "none",
    };
  }
  const silent = decision.action === "stay_silent";
  options.onPhase?.(silent ? "Она решила промолчать…" : "Она отвечает…");
  const generationStarted = performance.now();
  const dialogueContext = buildDialogueContext({
    userText: input.text,
    turnId: input.id,
    now,
    character: defaultCharacter,
    emotion,
    relationship,
    world: before.world,
    romance: romance.state,
    intimacy: intimacy.state,
    intimacyMind,
    intimacyPreferences,
    memoryContext,
    history: historyForDialogue,
    nlu,
    perception,
    thought,
    decision,
    responsePlan,
    retrospective,
    causalRelations,
  });
  const localPlan = planLocalDialogue(dialogueContext, romance.localText);
  const visualRuntime = {
    ...before,
    emotion,
    relationship,
    romance: romance.state,
    intimacy: intimacy.state,
  };
  const baseVisualEmotion = resolveVisualEmotionState(
    visualRuntime,
    {
      decision,
      responsePlan,
      dialogueActs: localPlan.dialogueActs,
      sourceIntent: localPlan.sourceIntent,
      eventIntensity: nlu.intensity,
    },
  );
  const appearanceResolution = resolveAppearanceRequest(
    visualRuntime,
    baseVisualEmotion,
    appearanceRequest,
    input.id,
  );
  const visualEmotion = appearanceResolution.visualEmotion;
  const recentAppearanceIds = recentCharacterAppearanceIds(history);
  const sequenceAppearance = shouldTriggerSequence(nlu, input.text, intimacy.state)
    ? selectSequenceAppearance(visualRuntime, now, { recentAssetIds: recentAppearanceIds, seed: input.id })
    : null;
  const readyAppearance = !sequenceAppearance && shouldShowReadyToChat(visualRuntime, now)
    ? selectReadyToChatAppearance(visualRuntime, now, { recentAssetIds: recentAppearanceIds, seed: input.id })
    : null;
  const appearance = sequenceAppearance?.appearance ?? readyAppearance ?? selectAppearance(
    visualRuntime,
    visualEmotion,
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
  const rendered = await localDialogueRenderer.render(localPlan, dialogueContext);
  logLocalDialogueTrace({ userText: input.text, nlu, plan: localPlan, rendered });
  checkSignal(signal);
  const localGuarded = guardCharacterReply(rendered.text, input.text, decision, responsePlan);
  let guarded = localGuarded;
  let replyParts = localGuarded.text ? [localGuarded.text] : [];
  let cloudLanguage: CloudLanguageResult = { attempted: false, used: false, reason: "local-only" };
  if (!silent) {
    cloudLanguage = await renderCloudLanguage({
      userText: input.text,
      localDraft: localGuarded.text,
      intent: nlu.intent,
      dialogueActs: localPlan.dialogueActs,
      goal: localPlan.goal,
      tone: responsePlan.tone,
      length: responsePlan.length,
      sceneMechanic,
      semantic: {
        topic: nlu.topic,
        focus: nlu.semantic.focus,
        subject: nlu.semantic.subject,
        stance: nlu.semantic.stance,
        questionType: nlu.questionType,
        isQuestion: nlu.isQuestion,
        reciprocal: nlu.semantic.reciprocal,
        asksCharacterView: nlu.semantic.asksCharacterView,
        wantsAdvice: nlu.semantic.wantsAdvice,
        wantsListening: nlu.semantic.wantsListening,
        confidence: nlu.confidence,
        appearanceRequest: appearanceResolution.requested
          ? {
              requestedVibe: appearanceResolution.requestedVibe,
              outcome: appearanceResolution.outcome,
              reason: appearanceResolution.reason,
              selectedEmotion: appearanceResolution.selectedEmotion,
              suggestive: appearanceResolution.suggestive,
            }
          : undefined,
      },
      decision: {
        action: decision.action,
        mode: decision.content.mode,
        stance: decision.content.stance,
        summary: decision.content.summary,
        locked: decision.content.locked,
        shouldAskFollowUp: decision.shouldAskFollowUp,
        shouldReferenceMemory: decision.shouldReferenceMemory,
      },
      continuity: {
        currentTopic: dialogueFrame.currentTopic,
        previousTopic: dialogueFrame.previousTopic,
        pendingQuestion: dialogueFrame.pendingQuestion,
        previousUserText: dialogueFrame.previousUserText,
        previousUserTextBeforeLast: dialogueFrame.previousUserTextBeforeLast,
        previousCharacterText: dialogueFrame.previousCharacterText,
        previousCharacterTextBeforeLast: dialogueFrame.previousCharacterTextBeforeLast,
        lastUserIntent: dialogueFrame.lastUserIntent,
        lastCharacterIntent: dialogueFrame.lastCharacterIntent,
        turnsOnTopic: dialogueFrame.turnsOnTopic,
      },
      world: {
        timeOfDay: before.world.timeOfDay,
        location: before.world.currentLocation,
        activity: before.world.currentActivity,
        availability: before.world.availability,
        isAwake: before.world.isAwake,
        connectionDrive: before.world.connectionDrive,
        activityDetail: describeWorldActivityDetail(before.world.currentActivity, now),
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
      romancePhase: romance.state.phase,
      intimacy: {
        enabled: intimacy.state.adultModeEnabled,
        phase: intimacy.state.phase,
        interactionStatus: intimacy.state.interactionStatus,
        comfort: intimacy.state.comfort,
        interest: intimacy.state.interest,
        arousal: intimacy.state.arousal,
        initiativeDrive: intimacy.state.initiativeDrive,
        signal: {
          kind: nlu.semantic.intimacy.kind,
          strength: nlu.semantic.intimacy.strength,
          explicit: nlu.semantic.intimacy.explicit,
          intimacyContext: nlu.semantic.intimacy.intimacyContext === true,
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
      thought: {
        observation: thought.observation,
        interpretation: thought.interpretation,
        feeling: thought.feeling,
        desire: thought.desire,
        concern: thought.concern,
        stance: thought.stance,
        memoryEcho: thought.memoryEcho,
        reconsideration: thought.reconsideration,
        relationalEmotion: thought.relationalEmotion,
        relationalReflection: thought.relationalReflection,
        retrospectiveEcho: thought.retrospectiveEcho,
      },
      // v0.17: GPT owns normal conversational continuity. Give it a real
      // short-term dialogue window; durable memory still comes from Local Brain.
      recentHistory: historyForDialogue.slice(-14).map((line) => ({
        role: line.role,
        text: line.text,
      })),
      recoveredHistory: retrospective?.evidence.slice(-4).map((line) => ({
        role: line.role,
        text: line.text,
      })),
      memories: memoryContext.memories.slice(0, 6).map((memory) => ({
        summary: memory.summary,
        kind: memory.kind,
        importance: memory.importance,
        emotionalWeight: memory.emotionalWeight,
        confidence: memory.confidence,
        retrievalStrength: memory.retrievalStrength,
      })),
      facts: memoryContext.facts.slice(0, 6).map((fact) => ({
        statement: fact.statement,
        subject: fact.subject,
        confidence: fact.confidence,
      })),
      openThreads: memoryContext.openThreads.slice(0, 3).map((thread) => ({
        summary: thread.summary,
        priority: thread.priority,
      })),
      retrospective: retrospective?.summary,
      causal: causalRelations.slice(0, 2).map((relation) =>
        `${relation.cause} → ${relation.effect}`,
      ),
      locked: decision.content.locked,
      silent,
    }, signal);
    checkSignal(signal);
    if (cloudLanguage.used && cloudLanguage.text) {
      const candidateParts = (cloudLanguage.messages?.length
        ? cloudLanguage.messages
        : [cloudLanguage.text])
        .map((part) => part.replace(/\s+/gu, " ").trim())
        .filter(Boolean)
        .slice(0, 3);
      const candidateText = candidateParts.join(" ");
      const cloudGuarded = guardCloudCharacterReply(
        candidateText,
        input.text,
        decision,
        responsePlan,
      );
      // GPT owns ordinary conversational wording/continuity. Local Guard now
      // protects only durable invariants; if one is violated we keep the local
      // fallback rather than persisting a contradictory character state.
      if (!cloudGuarded.usedFallback && candidateParts.length) {
        replyParts = candidateParts;
        guarded = { ...cloudGuarded, text: candidateParts.join("\n") };
      } else {
        cloudLanguage = { ...cloudLanguage, used: false, reason: cloudGuarded.reason ?? "response-guard" };
      }
    }
  }
  if (!replyParts.length && guarded.text) replyParts = [guarded.text];
  const reply = replyParts.join("\n");
  const generationMs = Math.round(performance.now() - generationStarted);
  // Show one temporary combined bubble while the turn is still unsaved. After
  // commit, a cloud turn may materialize as 2–3 separate human-like bubbles.
  if (!silent) publish(reply);
  const replyTimestamp = runtimeNow({
    ...before,
    emotion,
    relationship,
  });
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
        decision: decision.action,
        tone: responsePlan.tone,
        contentMode: decision.content.mode,
        contentStance: decision.content.stance,
        contentLocked: decision.content.locked,
        visualCue: responsePlan.visualCue,
        mindContinuity:
          index === 0 && thought.topic && thought.topicKey && thought.position && thought.positionReason && thought.persistence >= 0.58
            ? {
                topic: thought.topic,
                topicKey: thought.topicKey,
                position: thought.position,
                reason: thought.positionReason,
                confidence: thought.positionConfidence,
                persistence: thought.persistence,
                reconsideration: thought.reconsideration,
                challengeDirection: thought.challengeDirection,
                changedFrom: thought.changedFrom,
              }
            : undefined,
        romanceAction: index === 0 ? romance.action : "none",
        romancePhase: romance.state.phase,
        intimacyAction: index === 0 ? intimacy.action : "none",
        intimacyPhase: intimacy.state.phase,
        intimacyMind: index === 0 && intimacyMind.active
          ? {
              desire: intimacyMind.desire,
              tenderness: intimacyMind.tenderness,
              caution: intimacyMind.caution,
              conflicted: intimacyMind.conflicted,
              preferredPace: intimacyMind.preferredPace,
              wantsCloseness: intimacyMind.wantsCloseness,
              wantsMore: intimacyMind.wantsMore,
            }
          : undefined,
        appearanceAssetId: appearance.assetId,
        localDialogue: {
          templateId: rendered.templateId,
          dialogueActs: rendered.dialogueActs,
          openingPhrase: index === 0 ? rendered.openingPhrase : undefined,
          fallbackLevel: rendered.fallbackLevel,
        },
      },
      importance: index === 0 ? 0.35 : 0.2,
    }),
  );
  const world = markUserInteraction(before.world, replyTimestamp, {
    engaged: !silent,
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
          ].map((e) => [e.id, e]),
        ).values(),
      ],
      { emotion, relationship, romance: romance.state, appearance },
      world,
      base.revision,
    );
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "turn-already-committed")
      throw error;
    const saved = await repository.getEvent(replyId);
    const boot = await bootstrapRuntime(uid, signal);
    const savedPayload = saved!.payload as {
      text?: string;
      silent?: boolean;
      localDialogue?: { templateId?: string; dialogueActs?: DialogueAct[] };
      appearanceAssetId?: string;
    };
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
      renderMeta: savedPayload.localDialogue
        ? {
            templateId: savedPayload.localDialogue.templateId,
            dialogueActs: savedPayload.localDialogue.dialogueActs,
          }
        : undefined,
      state: boot.state,
      trace: null,
    };
  }
  let savedIntimacy = intimacy.state;
  if (intimacy.changed) {
    try {
      savedIntimacy = await repository.commitIntimacyState(intimacy.state, intimacy.state.revision);
    } catch (error) {
      // The chat turn is already durably committed. An intimacy revision race
      // must not turn a saved message into a failed message; use the newer state.
      const latest = await repository.loadIntimacyState();
      if (latest) savedIntimacy = latest;
      else if (!(error instanceof Error && error.message.includes("intimacy-state-conflict"))) throw error;
    }
  }
  const evolvedIntimacyPreferences = evolveIntimacyPreferences(intimacyPreferences, {
    before: before.intimacy ?? createInitialIntimacyState(now),
    after: savedIntimacy,
    signal: nlu.semantic.intimacy,
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
      // Preference learning is secondary to the already committed chat turn.
      // A concurrent window may have learned from another interaction first.
      if (!(error instanceof Error && error.message.includes("intimacy-preferences-conflict"))) throw error;
    }
  }
  checkSignal(signal);
  // Reinforcement is deliberately outside the response critical path. The
  // answer is already validated and committed; a separate repository instance
  // has no turn AbortSignal, so the write can finish after the UI becomes idle.
  if (memoryContext.memories.length) {
    const accessedMemoryIds = memoryContext.memories.map((memory) => memory.id);
    void getCompanionRepository(defaultCharacter.id, uid)
      .reinforceMemories(accessedMemoryIds, replyTimestamp)
      .catch(() => {});
  }
  const trace: RuntimeTrace = {
    timings: { preflightMs, contextMs, generationMs, saveMs: Math.round(performance.now() - saveStarted),
      totalMs: Math.round(performance.now() - started), firstTextMs },
    usedGeminiPerception: false,
    usedGeminiReply: false,
    nlu,
    localRenderer: rendered.debug,
    cloudLanguage,
    intimacy: { enabled: savedIntimacy.adultModeEnabled, phase: savedIntimacy.phase, action: intimacy.action },
    appearanceRequest: {
      requested: appearanceResolution.requested,
      outcome: appearanceResolution.outcome,
      requestedVibe: appearanceResolution.requestedVibe,
      selectedEmotion: appearanceResolution.selectedEmotion,
      reason: appearanceResolution.reason,
    },
    responseGuardFallback: guarded.usedFallback,
    responseGuardReason: guarded.reason,
    decision,
    responsePlan,
    reasoning: {
      retrospective: retrospective?.triggered === true,
      recovered: retrospective?.recovered === true,
      scannedLines: retrospective?.scannedLines ?? historyForDialogue.length,
      causalRelations: causalRelations.length,
    },
    memoryContext: {
      memories: memoryContext.memories.map((m) => m.summary),
      facts: memoryContext.facts.map((f) => f.statement),
      openThreads: memoryContext.openThreads.map((t) => t.summary),
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
      templateId: rendered.templateId,
      dialogueActs: rendered.dialogueActs,
      appearanceAssetId: appearance.assetId,
    })),
    silent,
    replyId,
    replyTimestamp,
    appearanceAssetId: appearance.assetId,
    renderMeta: { templateId: rendered.templateId, dialogueActs: rendered.dialogueActs },
    state: { emotion, relationship, world, romance: romance.state, intimacy: savedIntimacy, appearance, revision: base.revision + 1 },
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
  const consolidation = await recoverRecentMemory(repository, 12);
  checkSignal(signal);
  const maintenanceNow = runtimeNow(state);
  const advanced = advance(state, maintenanceNow);
  const initiatives = await refreshInitiatives(
    repository,
    defaultCharacter,
    advanced.state.emotion,
    advanced.state.relationship,
    advanced.state.world,
    maintenanceNow,
    advanced.state.romance,
    advanced.state.intimacy,
  );
  const [recovery, pending] = await Promise.all([
    repository.loadMemoryRecoveryState(), repository.listPendingMemoryEvents(1),
  ]);
  const memoryBacklog = pending.length > 0 || recovery?.backfillComplete === false;
  const memoryHealth = memoryBacklog ? null : await getMemoryHealth(repository);
  const proactiveConversation = allowInitiative
    ? (await repository.listConversationEvents({ limit: 24 })).events
    : [];
  const lastProactive = latestProactiveEvent(proactiveConversation);
  const unansweredProactive = Boolean(
    lastProactive && lastProactive.timestamp > advanced.state.world.lastUserInteractionAt,
  );
  const proactiveCooldownOpen = !lastProactive ||
    maintenanceNow - lastProactive.timestamp >= PROACTIVE_MESSAGE_COOLDOWN_MS;
  let message: ConversationLine | null = null;
  const initiativeWindowOpen = () =>
    allowInitiative &&
    !unansweredProactive &&
    proactiveCooldownOpen &&
    canSurfaceInitiative() &&
    !initiativeSignal.aborted &&
    advanced.state.world.isAwake &&
    advanced.state.world.availability !== "sleeping" &&
    maintenanceNow - advanced.state.world.lastUserInteractionAt > 6 * 60_000;

  if (initiativeWindowOpen()) {
    const initiative = initiatives.find(
      (i) => i.notBefore <= maintenanceNow && i.expiresAt > maintenanceNow,
    );
    if (initiative) {
      const id = `proactive_${initiative.id}`;
      const existing = await repository.getEvent(id);
      if (!existing && initiativeWindowOpen()) {
        let text: string | null = null;
        let proactiveRender: Awaited<ReturnType<typeof localDialogueRenderer.render>> | null = null;
        if (!initiativeSignal.aborted) {
          const [proactiveMemory, proactivePage] = await Promise.all([
            retrieveMemoryContext(initiative.topic, repository, maintenanceNow),
            repository.listConversationEvents({ limit: 40 }),
          ]);
          checkSignal(signal);
          if (!initiativeSignal.aborted) {
            const proactiveHistory = conversationFrom(proactivePage.events);
            const bridge = initiativeSemanticBridge(
              initiative,
              advanced.state.emotion,
              advanced.state.relationship,
            );
            const proactiveNlu = analyzeLocalNLU(initiative.topic);
            const proactivePerception = applyLocalNLUToPerception(
              localPerception(initiative.topic),
              proactiveNlu,
            );
            const proactiveContext = buildDialogueContext({
              turnId: id,
              now: maintenanceNow,
              character: defaultCharacter,
              emotion: advanced.state.emotion,
              relationship: advanced.state.relationship,
              world: advanced.state.world,
              romance: advanced.state.romance,
              intimacy: advanced.state.intimacy,
              memoryContext: proactiveMemory,
              history: proactiveHistory.slice(-24),
              nlu: proactiveNlu,
              perception: proactivePerception,
              decision: bridge.decision,
              responsePlan: bridge.responsePlan,
              initiative,
            });
            const proactivePlan = planAutonomousDialogue(proactiveContext);
            proactiveRender = await localDialogueRenderer.render(proactivePlan, proactiveContext);
            logLocalDialogueTrace({
              userText: undefined,
              nlu: proactiveNlu,
              plan: proactivePlan,
              rendered: proactiveRender,
            });
            text = sanitizeProactiveDialogueText(proactiveRender.text);
            if (!text) text = renderLocalInitiative(initiative);
          }
        }

        // A real user turn may have started while local initiative text was being prepared.
        // Re-check immediately before publishing so initiative work yields to conversation.
        if (text && initiativeWindowOpen()) {
          const publishNow = runtimeNow(advanced.state);
          const publishState = advance(advanced.state, publishNow).state;
          if (
            publishState.world.isAwake &&
            publishState.world.availability !== "sleeping" &&
            initiative.notBefore <= publishNow &&
            initiative.expiresAt > publishNow
          ) {
            const event = createEvent({
              id,
              type: "character_action",
              source: "character",
              timestamp: publishNow,
              payload: {
                text,
                initiativeId: initiative.id,
                localDialogue: proactiveRender ? {
                  templateId: proactiveRender.templateId,
                  dialogueActs: proactiveRender.dialogueActs,
                  openingPhrase: proactiveRender.openingPhrase,
                  fallbackLevel: proactiveRender.fallbackLevel,
                } : undefined,
              },
              importance: 0.4,
            });
            await repository.appendEvent(event);
            await repository.saveInitiative({ ...initiative, status: "surfaced" });
            initiative.status = "surfaced";
            message = {
              id,
              role: "character",
              text,
              timestamp: event.timestamp,
              proactive: true,
              templateId: proactiveRender?.templateId,
              dialogueActs: proactiveRender?.dialogueActs,
            };
          }
        }
      } else if (existing) {
        await repository.saveInitiative({ ...initiative, status: "surfaced" });
        initiative.status = "surfaced";
      }
    }
  }
  if (allowInitiative && (unansweredProactive || !proactiveCooldownOpen)) {
    const cooldownUntil = lastProactive
      ? lastProactive.timestamp + PROACTIVE_MESSAGE_COOLDOWN_MS
      : maintenanceNow;
    const deferredUntil = unansweredProactive
      ? Math.max(maintenanceNow + PROACTIVE_BLOCK_RECHECK_MS, cooldownUntil)
      : Math.max(maintenanceNow + 60_000, cooldownUntil);
    for (const item of initiatives) {
      if (item.status !== "pending" || item.notBefore >= deferredUntil) continue;
      const deferred = { ...item, notBefore: deferredUntil };
      await repository.saveInitiative(deferred);
      item.notBefore = deferredUntil;
    }
  }
  return { consolidation, memoryHealth, memoryBacklog, initiatives, message };
}
