import { defaultCharacter } from '../character/default-character';
import { createEvent } from '../events/event-types';
import { applyEmotionDelta, decayEmotions, initialEmotionalState } from '../emotions/emotion-engine';
import { applyRelationshipDelta, initialRelationshipState } from '../relationship/relationship-engine';
import type { EmotionalState } from '../emotions/emotion-types';
import type { RelationshipState } from '../relationship/relationship-types';
import { buildThought, decide, interpret, localPerception, mergePerceptions, planResponse } from '../cognition/local-cognition';
import { inferStateEffects } from '../cognition/state-effects';
import { getCompanionRepository } from '../storage/repository-factory';
import { generateCharacterReply } from '../ai/gemini-client';
import { analyzeUserMessage } from '../ai/perception-client';
import { localFallbackReply } from '../dialogue/local-response';
import { retrieveMemoryContext } from '../memory/memory-context';
import { consolidateEvents, recoverRecentMemory } from '../memory/memory-consolidation';
import { getMemoryHealth, type MemoryHealthSnapshot } from '../memory/memory-health';
import type { MemoryConsolidationReport, MemoryContext } from '../memory/memory-types';
import { applyWorldSimulationEmotion, createInitialWorldState, markUserInteraction, simulateWorld } from '../world/world-engine';
import type { WorldSimulationResult, WorldState } from '../world/world-types';
import { refreshInitiatives } from '../initiative/initiative-engine';
import type { CharacterInitiative } from '../initiative/initiative-types';

export interface RuntimeState {
  emotion: EmotionalState;
  relationship: RelationshipState;
  world: WorldState;
}

export interface ConversationLine {
  id: string;
  role: 'user' | 'character';
  text: string;
  timestamp: number;
  proactive?: boolean;
}

export interface RuntimeTrace {
  perception: ReturnType<typeof localPerception>;
  interpretation: ReturnType<typeof interpret>;
  thought: ReturnType<typeof buildThought>;
  decision: ReturnType<typeof decide>;
  responsePlan: ReturnType<typeof planResponse>;
  memoryContext: {
    memories: string[];
    facts: string[];
    openThreads: string[];
  };
  world: {
    currentActivity: string;
    currentLocation: string;
    timeOfDay: string;
    availability: string;
    connectionDrive: number;
    generatedEvents: string[];
  };
  initiatives: Array<Pick<CharacterInitiative, 'kind' | 'topic' | 'priority' | 'status'>>;
  consolidation: MemoryConsolidationReport;
  memoryHealth: MemoryHealthSnapshot;
  usedGeminiPerception: boolean;
  usedGeminiReply: boolean;
}

export interface RuntimeResult {
  reply: string;
  state: RuntimeState;
  trace: RuntimeTrace;
}

export interface RuntimeBootstrapResult {
  state: RuntimeState;
  proactiveMessage: string | null;
  surfacedInitiative: CharacterInitiative | null;
  recentConversation: ConversationLine[];
}

const repository = getCompanionRepository(defaultCharacter.id);

function traceMemoryContext(context: MemoryContext) {
  return {
    memories: context.memories.map((memory) => `${memory.kind}:${memory.summary}`),
    facts: context.facts.map((fact) => `${fact.statement} [${fact.confidence.toFixed(2)}]`),
    openThreads: context.openThreads.map((thread) => thread.summary),
  };
}

async function persistWorldSimulation(simulation: WorldSimulationResult) {
  const events = simulation.generatedEvents.map((worldEvent) => createEvent({
    id: `event_${worldEvent.id}`,
    type: 'world' as const,
    source: 'system' as const,
    timestamp: worldEvent.at,
    payload: {
      worldEventId: worldEvent.id,
      kind: worldEvent.kind,
      summary: worldEvent.summary,
      location: worldEvent.location,
      activity: worldEvent.activity,
      shareWorthiness: worldEvent.shareWorthiness,
    },
    importance: Math.min(0.8, 0.22 + worldEvent.shareWorthiness * 0.58),
  }));

  for (const event of events) await repository.appendEvent(event);
  if (events.length) await consolidateEvents(events, repository);
  return events;
}

function advanceWorldLocally(state: RuntimeState, now = Date.now()) {
  const decayedEmotion = decayEmotions(state.emotion, now);
  const simulation = simulateWorld(state.world, decayedEmotion, now);
  const emotion = applyWorldSimulationEmotion(decayedEmotion, simulation, now);

  return {
    state: { ...state, emotion, world: simulation.world },
    simulation,
  };
}

async function runStartupMaintenance(
  state: RuntimeState,
  simulation: WorldSimulationResult,
  now: number,
) {
  try {
    await persistWorldSimulation(simulation);
    await Promise.all([
      repository.saveWorldState(state.world),
      repository.saveSnapshot({ emotion: state.emotion, relationship: state.relationship }),
    ]);

    // Memory repair/consolidation can require many Firestore reads/writes.
    // It must never block the first usable frame of the app.
    await recoverRecentMemory(repository, 40);
    await refreshInitiatives(repository, defaultCharacter, state.emotion, state.relationship, state.world, now);
  } catch {
    // Startup maintenance is best-effort. Core UI/chat boot must remain usable.
  }
}

async function hydrateRuntimeFast(now = Date.now()) {
  const [stored, storedWorld] = await Promise.all([
    repository.loadSnapshot(),
    repository.loadWorldState(),
  ]);

  const baseState: RuntimeState = {
    emotion: stored?.emotion ?? { ...initialEmotionalState, updatedAt: now },
    relationship: stored?.relationship ?? { ...initialRelationshipState, updatedAt: now },
    world: storedWorld ?? createInitialWorldState(now),
  };

  return advanceWorldLocally(baseState, now);
}

async function loadRecentConversation(maxEvents = 80): Promise<ConversationLine[]> {
  const events = await repository.listRecentEvents(maxEvents);
  return events
    .flatMap((event): ConversationLine[] => {
      if (event.type === 'message' && (event.source === 'user' || event.source === 'character')) {
        const text = String((event.payload as { text?: string })?.text ?? '').trim();
        return text ? [{ id: event.id, role: event.source, text, timestamp: event.timestamp }] : [];
      }
      if (event.type === 'character_action' && event.source === 'character') {
        const text = String((event.payload as { text?: string })?.text ?? '').trim();
        return text ? [{ id: event.id, role: 'character', text, timestamp: event.timestamp, proactive: true }] : [];
      }
      return [];
    })
    .slice(-40);
}

export async function bootstrapRuntime(now = Date.now()): Promise<RuntimeBootstrapResult> {
  const hydrated = await hydrateRuntimeFast(now);
  const recentConversation = await loadRecentConversation();

  // Do not await memory recovery, initiative generation or world persistence here.
  // Those were the main reason the UI could stay on "Инициализация..." for a very long time.
  void runStartupMaintenance(hydrated.state, hydrated.simulation, now);

  return {
    state: hydrated.state,
    proactiveMessage: null,
    surfacedInitiative: null,
    recentConversation,
  };
}

export async function loadRuntimeState(): Promise<RuntimeState> {
  const hydrated = await hydrateRuntimeFast();
  return hydrated.state;
}

export async function handleUserMessage(userText: string, currentState: RuntimeState): Promise<RuntimeResult> {
  const now = Date.now();
  const advanced = advanceWorldLocally(currentState, now);
  const stateBeforeInteraction = advanced.state;

  const userEvent = createEvent({
    type: 'message',
    source: 'user',
    payload: { text: userText },
    importance: 0.35,
  });
  await repository.appendEvent(userEvent);

  const memoryContext = await retrieveMemoryContext(userText, repository);
  const local = localPerception(userText);
  const modelPerception = await analyzeUserMessage(userText);
  const perception = mergePerceptions(local, modelPerception);
  const interpretation = interpret(perception, memoryContext, stateBeforeInteraction.emotion, stateBeforeInteraction.relationship);
  const preliminaryDecision = decide(
    defaultCharacter,
    perception,
    interpretation,
    stateBeforeInteraction.emotion,
    stateBeforeInteraction.relationship,
    stateBeforeInteraction.world,
  );
  const effects = inferStateEffects(perception, preliminaryDecision);
  const emotion = applyEmotionDelta(stateBeforeInteraction.emotion, effects.emotion, now);
  const relationship = applyRelationshipDelta(stateBeforeInteraction.relationship, effects.relationship, now);

  // Rebuild downstream cognition after deterministic state effects so the spoken response reflects the new state.
  const thought = buildThought(perception, interpretation, emotion, relationship);
  const decision = decide(defaultCharacter, perception, interpretation, emotion, relationship, stateBeforeInteraction.world);
  const responsePlan = planResponse(defaultCharacter, perception, interpretation, decision, emotion);

  let reply = await generateCharacterReply({
    userText,
    character: defaultCharacter,
    emotion,
    relationship,
    perception,
    interpretation,
    thought,
    decision,
    responsePlan,
    memoryContext,
    world: stateBeforeInteraction.world,
  });
  const usedGeminiReply = Boolean(reply);
  if (!reply) reply = localFallbackReply(userText, decision, responsePlan);

  const characterEvent = createEvent({
    type: 'message',
    source: 'character',
    payload: {
      text: reply,
      decision: decision.action,
      tone: responsePlan.tone,
      visualCue: responsePlan.visualCue,
    },
    importance: decision.action === 'set_boundary' || decision.action === 'show_affection' ? 0.42 : 0.3,
  });
  await repository.appendEvent(characterEvent);

  await persistWorldSimulation(advanced.simulation);
  const consolidation = await consolidateEvents([userEvent, characterEvent], repository);
  const world = markUserInteraction(stateBeforeInteraction.world, now);
  const state = { emotion, relationship, world };
  await Promise.all([
    repository.saveSnapshot({ emotion, relationship }),
    repository.saveWorldState(world),
  ]);

  const initiatives = await refreshInitiatives(repository, defaultCharacter, emotion, relationship, world, now);
  const memoryHealth = await getMemoryHealth(repository);

  return {
    reply,
    state,
    trace: {
      perception,
      interpretation,
      thought,
      decision,
      responsePlan,
      memoryContext: traceMemoryContext(memoryContext),
      world: {
        currentActivity: world.currentActivity,
        currentLocation: world.currentLocation,
        timeOfDay: world.timeOfDay,
        availability: world.availability,
        connectionDrive: world.connectionDrive,
        generatedEvents: advanced.simulation.generatedEvents.map((event) => event.summary),
      },
      initiatives: initiatives.map(({ kind, topic, priority, status }) => ({ kind, topic, priority, status })),
      consolidation,
      memoryHealth,
      usedGeminiPerception: Boolean(modelPerception),
      usedGeminiReply,
    },
  };
}
