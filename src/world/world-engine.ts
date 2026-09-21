import type { EmotionalState, EmotionDelta } from '../emotions/emotion-types';
import { applyEmotionDelta } from '../emotions/emotion-engine';
import { clampElapsedMs, resolveRoutine, resolveTimeOfDay } from './time-engine';
import { maybeCreateWorldEvent } from './daily-life';
import type { WorldEventSnapshot, WorldSimulationResult, WorldState } from './world-types';

const HOUR = 3_600_000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function createInitialWorldState(now = Date.now()): WorldState {
  const routine = resolveRoutine(now);
  return {
    currentLocation: routine.location,
    currentActivity: routine.activity,
    timeOfDay: resolveTimeOfDay(now),
    availability: routine.availability,
    isAwake: routine.isAwake,
    connectionDrive: 0.12,
    lastSimulatedAt: now,
    lastUserInteractionAt: now,
    recentEvents: [],
    updatedAt: now,
  };
}

function mergeDelta(target: EmotionDelta, incoming: EmotionDelta) {
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value !== 'number') continue;
    const typed = key as keyof EmotionDelta;
    target[typed] = ((target[typed] as number | undefined) ?? 0) + value;
  }
}

function uniqueEvents(events: WorldEventSnapshot[]) {
  const map = new Map<string, WorldEventSnapshot>();
  for (const event of events) map.set(event.id, event);
  return [...map.values()].sort((a, b) => a.at - b.at);
}

export function simulateWorld(
  state: WorldState,
  emotion: EmotionalState,
  now = Date.now(),
): WorldSimulationResult {
  if (now <= state.lastSimulatedAt) {
    return { world: state, emotionDelta: {}, generatedEvents: [] };
  }

  const elapsed = clampElapsedMs(state.lastSimulatedAt, now);
  const simulationStart = now - elapsed;
  const elapsedHours = elapsed / HOUR;
  const generatedEvents: WorldEventSnapshot[] = [];
  const emotionDelta: EmotionDelta = {};

  // Sample a bounded number of points instead of simulating every minute/hour.
  const samples = Math.min(8, Math.max(1, Math.ceil(elapsedHours / 2)));
  const step = elapsed / samples;
  for (let index = 1; index <= samples; index += 1) {
    const at = simulationStart + step * index;
    const event = maybeCreateWorldEvent(at);
    if (!event || state.recentEvents.some((existing) => existing.id === event.id) || generatedEvents.some((existing) => existing.id === event.id)) continue;
    generatedEvents.push(event);
    mergeDelta(emotionDelta, event.emotionalEffect);
  }

  const currentRoutine = resolveRoutine(now);
  const targetEnergyAdjustment = (currentRoutine.targetEnergy - emotion.energy) * Math.min(0.42, 0.1 + elapsedHours * 0.03);
  emotionDelta.energy = (emotionDelta.energy ?? 0) + targetEnergyAdjustment;

  const hoursSinceUser = Math.max(0, (now - state.lastUserInteractionAt) / HOUR);
  const desiredConnection = clamp(0.08 + Math.min(0.42, hoursSinceUser * 0.015));
  const connectionDrive = clamp(state.connectionDrive + (desiredConnection - state.connectionDrive) * Math.min(1, elapsedHours / 6));

  if (elapsedHours > 8 && generatedEvents.length === 0) {
    emotionDelta.curiosity = (emotionDelta.curiosity ?? 0) + 0.008;
  }

  const recentEvents = uniqueEvents([...state.recentEvents, ...generatedEvents]).slice(-6);
  const lastMeaningful = [...generatedEvents].reverse().find((event) => event.shareWorthiness >= 0.5);

  return {
    emotionDelta,
    generatedEvents,
    world: {
      ...state,
      currentLocation: currentRoutine.location,
      currentActivity: currentRoutine.activity,
      timeOfDay: resolveTimeOfDay(now),
      availability: currentRoutine.availability,
      isAwake: currentRoutine.isAwake,
      connectionDrive,
      lastSimulatedAt: now,
      lastMeaningfulWorldEventAt: lastMeaningful?.at ?? state.lastMeaningfulWorldEventAt,
      recentEvents,
      updatedAt: now,
    },
  };
}

export function applyWorldSimulationEmotion(emotion: EmotionalState, simulation: WorldSimulationResult, now = Date.now()) {
  return applyEmotionDelta(emotion, simulation.emotionDelta, now);
}

export function markUserInteraction(world: WorldState, now = Date.now()): WorldState {
  return {
    ...world,
    currentActivity: 'chatting',
    availability: 'free',
    isAwake: true,
    connectionDrive: Math.max(0.04, world.connectionDrive * 0.35),
    lastUserInteractionAt: now,
    updatedAt: now,
  };
}
