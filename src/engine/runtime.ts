import { defaultCharacter } from "../character/default-character";
import { createEvent, type CharacterEvent } from "../events/event-types";
import {
  applyEmotionDelta,
  decayEmotions,
  initialEmotionalState,
} from "../emotions/emotion-engine";
import {
  applyRelationshipDelta,
  initialRelationshipState,
} from "../relationship/relationship-engine";
import type { EmotionalState } from "../emotions/emotion-types";
import type { RelationshipState } from "../relationship/relationship-types";
import {
  buildThought,
  decide,
  interpret,
  localPerception,
  planResponse,
} from "../cognition/local-cognition";
import { inferStateEffects } from "../cognition/state-effects";
import { getCompanionRepository } from "../storage/repository-factory";
import {
  generateCharacterReply,
  generateInitiativeMessage,
} from "../ai/gemini-client";
import { localFallbackReply } from "../dialogue/local-response";
import { guardCharacterReply } from "../dialogue/response-guard";
import { retrieveMemoryContext } from "../memory/memory-context";
import { recoverRecentMemory } from "../memory/memory-consolidation";
import { getMemoryHealth } from "../memory/memory-health";
import {
  applyWorldSimulationEmotion,
  createInitialWorldState,
  markUserInteraction,
  simulateWorld,
} from "../world/world-engine";
import type { WorldState, WorldSimulationResult } from "../world/world-types";
import { worldClock } from "../world/time-engine";
import {
  refreshInitiatives,
  renderLocalInitiative,
} from "../initiative/initiative-engine";
import { checkSignal } from "../core/async";
import type { ConversationCursor } from "../storage/repositories/interfaces";

import { currentRomance, planRomance, type RomanceState } from "../relationship/romance";

import { selectAppearance, type AppearanceState } from "../avatar/appearance";
import { findCharacterAsset } from "../avatar/asset-catalog";

export interface RuntimeState {
  appearance?: AppearanceState;
  romance?: RomanceState;
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
}
export interface RuntimeTrace {
  usedGeminiPerception: boolean;
  usedGeminiReply: boolean;
  responseGuardFallback?: boolean;
  responseGuardReason?: string;
  decision: ReturnType<typeof decide>;
  responsePlan: ReturnType<typeof planResponse>;
  memoryContext: { memories: string[]; facts: string[]; openThreads: string[] };
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
      const payload = e.payload as { text?: string; silent?: boolean };
      const text = String(payload?.text ?? "").trim();
      const silent = e.source === "character" && payload?.silent === true;
      return text || silent
        ? [
            {
              id: e.id,
              role: e.source,
              text,
              timestamp: e.timestamp,
              proactive: e.type === "character_action",
              silent,
            },
          ]
        : [];
    });
}
export async function bootstrapRuntime(
  uid: string | null,
  signal: AbortSignal,
  now?: number,
) {
  const repository = repo(uid, signal);
  const wallNow = now ?? Date.now();
  const [{ snapshot: stored, world }, conversationPage, pendingTurns] = await Promise.all([
    repository.loadRuntimeState(),
    repository.listConversationEvents({ limit: 80 }),
    repository.listPendingTurns(100),
  ]);
  checkSignal(signal);
  // Read-only bootstrap: a delayed startup cannot overwrite a newer conversation.
  const state: RuntimeState = {
    revision: stored?.revision ?? 0,
    romance: stored?.romance,
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
  return {
    state: {
      ...advanced.state,
      pendingWorldEvents: worldEvents(advanced.simulation),
    },
    recentConversation: conversationFrom(
      [...new Map(
        [...conversationPage.events, ...pendingTurns].map((event) => [event.id, event]),
      ).values()].sort(
        (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
      ),
    ),
    pendingTurnIds: pendingTurns.map((event) => event.id),
    historyCursor: conversationPage.nextCursor,
    hasOlderConversation: conversationPage.hasMore,
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
  const { snapshot, world } = await repository.loadRuntimeState();
  checkSignal(signal);
  if (!snapshot || !world) return current;
  const revision = snapshot.revision ?? 0;
  if (revision <= current.revision) return current;
  return reconcileRuntimeState({
    pendingWorldEvents: current.pendingWorldEvents,
    revision,
    romance: snapshot.romance,
    appearance: snapshot.appearance,
    emotion: snapshot.emotion,
    relationship: snapshot.relationship,
    world,
  });
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
  const [existing, persisted] = await Promise.all([
    repository.getEvent(replyId), repository.loadRuntimeState(),
  ]);
  checkSignal(signal);
  const preflightMs = Math.round(performance.now() - started);
  if (existing) {
    await repository.dismissPendingTurn(input.id);
    const boot = await bootstrapRuntime(uid, signal);
    const payload = existing.payload as { text?: string; silent?: boolean };
    return {
      reply: String(payload.text ?? ""),
      silent: payload.silent === true,
      replyId,
      replyTimestamp: existing.timestamp,
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
    appearance: snapshot.appearance,
        world: latestWorld ?? current.world,
      }
    : current;

  const now = runtimeNow(base);
  const advanced = advance(base, now);
  const before = advanced.state;
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
  const [, memoryContext, history] = await Promise.all([
    repository.appendEvent(userEvent),
    retrieveMemoryContext(input.text, repository, now),
    base.revision !== current.revision
      ? repository.listConversationEvents({ limit: 80 }).then(page => conversationFrom(page.events))
      : Promise.resolve(options.history),
  ]);
  checkSignal(signal);
  const contextMs = Math.round(performance.now() - contextStarted);
  memoryContext.memories = memoryContext.memories.filter(
    (m) => !m.sourceEventIds.includes(input.id),
  );
  memoryContext.facts = memoryContext.facts.filter(
    (f) => !f.sourceEventIds.includes(input.id),
  );
  const perception = localPerception(
    input.text,
    history.slice(-6).map((line) => ({ role: line.role, text: line.text })),
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
  const effects = inferStateEffects(perception, preliminary);
  const emotion = applyEmotionDelta(before.emotion, effects.emotion, now);
  const relationship = applyRelationshipDelta(
    before.relationship,
    effects.relationship,
    now,
  );
  const thought = buildThought(
    perception,
    interpretation,
    emotion,
    relationship,
  );
  let decision = decide(
    defaultCharacter,
    perception,
    interpretation,
    emotion,
    relationship,
    before.world,
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
    character: defaultCharacter, emotion: before.emotion, relationship: before.relationship,
    world: before.world, decision, plan: responsePlan });
  decision = romance.decision;
  responsePlan = romance.plan;
  const appearance = selectAppearance({ ...before, romance: romance.state }, responsePlan.visualCue, now);
  const silent = decision.action === "stay_silent";
  options.onPhase?.(silent ? "Она решила промолчать…" : "Она отвечает…");
  const generationStarted = performance.now();
  const generated = silent
    ? ""
    : romance.localText ?? await generateCharacterReply(
        {
          userText: input.text,
          romance: romance.state,
          appearance: findCharacterAsset(appearance.assetId),
          character: defaultCharacter,
          emotion,
          relationship,
          perception,
          interpretation,
          thought,
          decision,
          responsePlan,
          memoryContext,
          world: before.world,
          history: history.filter(
            (l) =>
              l.id !== input.id &&
              l.id !== replyId &&
              !/(естественный языковой слой|состояние, память и решение уже)/iu.test(
                l.text,
              ),
          ),
        },
        // Never expose raw provider chunks before the final response guard.
        // The validated reply is published immediately below, before commitTurn.
        { signal },
      );
  checkSignal(signal);
  const guarded =
    generated === null
      ? {
          text: localFallbackReply(input.text, decision, responsePlan),
          usedFallback: true,
          reason: "gemini-unavailable",
        }
      : guardCharacterReply(generated, input.text, decision, responsePlan);
  const reply = guarded.text;
  const generationMs = Math.round(performance.now() - generationStarted);
  // Locked/local answers can be shown after validation, before the network commit.
  // They remain explicitly marked unsaved until commitTurn succeeds.
  if (!silent) publish(reply);
  const replyTimestamp = runtimeNow({
    ...before,
    emotion,
    relationship,
  });
  const characterEvent = createEvent({
    id: replyId,
    type: "message",
    source: "character",
    timestamp: replyTimestamp,
    payload: {
      text: reply,
      silent,
      inReplyTo: input.id,
      decision: decision.action,
      tone: responsePlan.tone,
      contentMode: decision.content.mode,
      contentStance: decision.content.stance,
      contentLocked: decision.content.locked,
      visualCue: responsePlan.visualCue,
      romanceAction: romance.action,
      romancePhase: romance.state.phase,
      appearanceAssetId: appearance.assetId,
    },
    importance: 0.35,
  });
  const world = markUserInteraction(before.world, replyTimestamp, {
    engaged: !silent,
  });
  options.onPhase?.("Сохраняем ответ…");
  const saveStarted = performance.now();
  try {
    await repository.commitTurn(
      [
        userEvent,
        characterEvent,
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
    const savedPayload = saved!.payload as { text?: string; silent?: boolean };
    return {
      reply: String(savedPayload.text ?? ""),
      silent: savedPayload.silent === true,
      replyId,
      replyTimestamp: saved!.timestamp,
      state: boot.state,
      trace: null,
    };
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
    usedGeminiReply: generated !== null && !silent && romance.localText === undefined,
    responseGuardFallback: guarded.usedFallback,
    responseGuardReason: guarded.reason,
    decision,
    responsePlan,
    memoryContext: {
      memories: memoryContext.memories.map((m) => m.summary),
      facts: memoryContext.facts.map((f) => f.statement),
      openThreads: memoryContext.openThreads.map((t) => t.summary),
    },
  };
  return {
    reply,
    silent,
    replyId,
    replyTimestamp,
    state: { emotion, relationship, world, romance: romance.state, appearance, revision: base.revision + 1 },
    trace,
  };
}
export interface MaintenanceOptions {
  allowInitiative?: boolean;
  initiativeSignal?: AbortSignal;
  canSurfaceInitiative?: () => boolean;
}

function initiativeAbort(error: unknown, signal?: AbortSignal) {
  return Boolean(
    signal?.aborted &&
      (error === signal.reason ||
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && /abort|cancel|superseded/i.test(error.message))),
  );
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
  );
  const [recovery, pending] = await Promise.all([
    repository.loadMemoryRecoveryState(), repository.listPendingMemoryEvents(1),
  ]);
  const memoryBacklog = pending.length > 0 || recovery?.backfillComplete === false;
  const memoryHealth = memoryBacklog ? null : await getMemoryHealth(repository);
  let message: ConversationLine | null = null;
  const initiativeWindowOpen = () =>
    allowInitiative &&
    canSurfaceInitiative() &&
    !initiativeSignal.aborted &&
    advanced.state.world.isAwake &&
    advanced.state.world.availability !== "sleeping" &&
    maintenanceNow - advanced.state.world.lastUserInteractionAt > 10 * 60_000;

  if (initiativeWindowOpen()) {
    const initiative = initiatives.find(
      (i) => i.notBefore <= maintenanceNow && i.expiresAt > maintenanceNow,
    );
    if (initiative) {
      const id = `proactive_${initiative.id}`;
      const existing = await repository.getEvent(id);
      if (!existing && initiativeWindowOpen()) {
        let text: string | null = null;
        try {
          text =
            (await generateInitiativeMessage(
              {
                character: defaultCharacter,
                emotion: advanced.state.emotion,
                relationship: advanced.state.relationship,
                world: advanced.state.world,
                initiative,
                romance: advanced.state.romance,
              },
              { signal: initiativeSignal },
            )) ?? renderLocalInitiative(initiative);
        } catch (error) {
          if (!initiativeAbort(error, initiativeSignal)) throw error;
        }

        // A real user turn may have started while Gemini was generating the
        // proactive text. Re-check immediately before publishing so initiative
        // work yields to conversation without cancelling memory consolidation.
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
              payload: { text, initiativeId: initiative.id },
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
            };
          }
        }
      } else if (existing) {
        await repository.saveInitiative({ ...initiative, status: "surfaced" });
        initiative.status = "surfaced";
      }
    }
  }
  return { consolidation, memoryHealth, memoryBacklog, initiatives, message };
}
