/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import { applyEmotionDelta, type EmotionalState, type EmotionDelta } from "../emotions/emotions";

// ---- world-types.ts ----
export type TimeOfDay = "night" | "morning" | "day" | "evening";

export type WorldLocation =
  | "bedroom"
  | "living_room"
  | "kitchen"
  | "outside"
  | "cafe"
  | "unknown";

export type WorldActivity =
  | "sleeping"
  | "waking_up"
  | "breakfast"
  | "personal_project"
  | "reading"
  | "music"
  | "walk"
  | "cooking"
  | "errands"
  | "cafe_break"
  | "relaxing"
  | "chatting"
  | "idle";

export type Availability = "sleeping" | "free" | "occupied" | "resting";

export interface WorldEventSnapshot {
  id: string;
  at: number;
  kind: "routine" | "small_win" | "minor_annoyance" | "reflection" | "outing";
  summary: string;
  location: WorldLocation;
  activity: WorldActivity;
  emotionalEffect: EmotionDelta;
  shareWorthiness: number;
}

export interface WorldState {
  timeZone: string;
  currentLocation: WorldLocation;
  currentActivity: WorldActivity;
  timeOfDay: TimeOfDay;
  availability: Availability;
  isAwake: boolean;
  connectionDrive: number;
  lastSimulatedAt: number;
  lastUserInteractionAt: number;
  lastMeaningfulWorldEventAt?: number;
  recentEvents: WorldEventSnapshot[];
  updatedAt: number;
}

export interface WorldSimulationResult {
  world: WorldState;
  emotionDelta: EmotionDelta;
  generatedEvents: WorldEventSnapshot[];
}

// ---- time-engine.ts ----
const FALLBACK_TIME_ZONE = "UTC";

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function resolveSystemTimeZone() {
  const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return value && isValidTimeZone(value) ? value : FALLBACK_TIME_ZONE;
}

function zonedParts(timestamp: number, timeZone: string) {
  const zone = isValidTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(timestamp))) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
  };
}

export function getHourInTimeZone(timestamp: number, timeZone: string) {
  return zonedParts(timestamp, timeZone).hour;
}

export function calendarDateKey(timestamp: number, timeZone: string) {
  const parts = zonedParts(timestamp, timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function resolveTimeOfDay(
  timestamp: number,
  timeZone: string,
): TimeOfDay {
  const hour = getHourInTimeZone(timestamp, timeZone);
  if (hour < 6) return "night";
  if (hour < 11) return "morning";
  if (hour < 18) return "day";
  return "evening";
}

export interface RoutineSlot {
  activity: WorldActivity;
  location: WorldLocation;
  availability: Availability;
  isAwake: boolean;
  targetEnergy: number;
}

function pick<T>(items: readonly T[], timestamp: number, salt: string): T {
  const bucket = Math.floor(timestamp / 3_600_000);
  let hash = 2166136261;
  const value = `${bucket}:${salt}`;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return items[Math.abs(hash) % items.length];
}

export function resolveRoutine(
  timestamp: number,
  timeZone: string,
): RoutineSlot {
  const hour = getHourInTimeZone(timestamp, timeZone);

  if (hour < 6) {
    return {
      activity: "sleeping",
      location: "bedroom",
      availability: "sleeping",
      isAwake: false,
      targetEnergy: 0.85,
    };
  }
  if (hour < 8) {
    return {
      activity: "waking_up",
      location: "bedroom",
      availability: "resting",
      isAwake: true,
      targetEnergy: 0.42,
    };
  }
  if (hour < 10) {
    return {
      activity: "breakfast",
      location: "kitchen",
      availability: "free",
      isAwake: true,
      targetEnergy: 0.66,
    };
  }
  if (hour < 13) {
    const activity = pick(
      ["personal_project", "reading"] as const,
      timestamp,
      "late-morning",
    );
    return {
      activity,
      location: activity === "reading" ? "living_room" : "bedroom",
      availability: "occupied",
      isAwake: true,
      targetEnergy: 0.72,
    };
  }
  if (hour < 15) {
    const activity = pick(
      ["walk", "cafe_break", "errands"] as const,
      timestamp,
      "midday",
    );
    const location = activity === "cafe_break" ? "cafe" : "outside";
    return {
      activity,
      location,
      availability: activity === "cafe_break" ? "free" : "occupied",
      isAwake: true,
      targetEnergy: 0.66,
    };
  }
  if (hour < 18) {
    const activity = pick(
      ["personal_project", "reading", "errands"] as const,
      timestamp,
      "afternoon",
    );
    const location =
      activity === "errands"
        ? "outside"
        : activity === "reading"
          ? "living_room"
          : "bedroom";
    return {
      activity,
      location,
      availability: "occupied",
      isAwake: true,
      targetEnergy: 0.58,
    };
  }
  if (hour < 21) {
    const activity = pick(
      ["cooking", "walk", "music"] as const,
      timestamp,
      "evening",
    );
    const location =
      activity === "cooking"
        ? "kitchen"
        : activity === "walk"
          ? "outside"
          : "living_room";
    return {
      activity,
      location,
      availability: "free",
      isAwake: true,
      targetEnergy: 0.5,
    };
  }
  if (hour < 24) {
    const activity = pick(
      ["reading", "music", "relaxing"] as const,
      timestamp,
      "late-evening",
    );
    return {
      activity,
      location: "living_room",
      availability: "resting",
      isAwake: true,
      targetEnergy: 0.34,
    };
  }

  return {
    activity: "idle",
    location: "unknown",
    availability: "free",
    isAwake: true,
    targetEnergy: 0.5,
  };
}

export function clampElapsedMs(from: number, to: number, maxDays = 14) {
  const max = maxDays * 24 * 3_600_000;
  return Math.max(0, Math.min(to - from, max));
}

function monotonicNow() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : 0;
}

/**
 * Uses wall clock normally, but if the device clock moves behind persisted
 * state, continues forward from the persisted floor using a monotonic timer.
 * This keeps world time from freezing or moving backwards inside a session.
 */
export class StableWorldClock {
  private fallbackFloor = 0;
  private fallbackMono = 0;
  private last = 0;

  reset() {
    this.fallbackFloor = 0;
    this.fallbackMono = 0;
    this.last = 0;
  }

  now(
    minimum = 0,
    wallNow = Date.now(),
    monoNow = monotonicNow(),
  ) {
    let candidate = wallNow;

    if (candidate < minimum) {
      if (this.fallbackFloor < minimum || this.fallbackFloor === 0) {
        this.fallbackFloor = minimum;
        this.fallbackMono = monoNow;
      }
      candidate =
        this.fallbackFloor + Math.max(0, monoNow - this.fallbackMono);
    } else {
      this.fallbackFloor = 0;
      this.fallbackMono = monoNow;
    }

    candidate = Math.max(candidate, minimum, this.last);
    this.last = candidate;
    return candidate;
  }
}

export const worldClock = new StableWorldClock();

export function resetWorldClock() {
  worldClock.reset();
}

// ---- daily-life.ts ----
const clampWorldEvent = (value: number) => Math.max(0, Math.min(1, value));

function deterministic01(timestamp: number, salt: string) {
  const bucket = Math.floor(timestamp / (2 * 3_600_000));
  let hash = 5381;
  const input = `${bucket}:${salt}`;
  for (let index = 0; index < input.length; index += 1)
    hash = (hash * 33) ^ input.charCodeAt(index);
  return (Math.abs(hash >>> 0) % 10_000) / 10_000;
}

interface EventTemplate {
  kind: WorldEventSnapshot["kind"];
  activities: WorldActivity[];
  location?: WorldLocation;
  summary: string;
  emotionalEffect: EmotionDelta;
  shareWorthiness: number;
}

const templates: EventTemplate[] = [
  {
    kind: "reflection",
    activities: ["reading", "relaxing"],
    summary:
      "She got absorbed in something she was reading and kept thinking about one idea afterward.",
    emotionalEffect: { curiosity: 0.025, happiness: 0.008 },
    shareWorthiness: 0.56,
  },
  {
    kind: "small_win",
    activities: ["personal_project"],
    summary:
      "She made satisfying progress on a personal project and felt quietly pleased with herself.",
    emotionalEffect: { happiness: 0.025, irritation: -0.008 },
    shareWorthiness: 0.61,
  },
  {
    kind: "minor_annoyance",
    activities: ["errands", "cooking"],
    summary:
      "A small everyday inconvenience irritated her for a while, though it was not serious.",
    emotionalEffect: { irritation: 0.035, happiness: -0.012 },
    shareWorthiness: 0.38,
  },
  {
    kind: "outing",
    activities: ["walk"],
    summary:
      "She took a short walk to clear her head and came back a little calmer.",
    emotionalEffect: { anxiety: -0.018, irritation: -0.014, happiness: 0.012 },
    shareWorthiness: 0.46,
  },
  {
    kind: "outing",
    activities: ["cafe_break"],
    location: "cafe",
    summary:
      "She spent a little time at a café for a change of scenery and enjoyed the quiet break.",
    emotionalEffect: { happiness: 0.018, boredom: -0.025, curiosity: 0.008 },
    shareWorthiness: 0.54,
  },
  {
    kind: "routine",
    activities: ["music"],
    summary: "She put on music and let herself switch off for a bit.",
    emotionalEffect: { irritation: -0.012, anxiety: -0.012 },
    shareWorthiness: 0.28,
  },
];

function chooseTemplate(activity: WorldActivity, timestamp: number) {
  const candidates = templates.filter((template) =>
    template.activities.includes(activity),
  );
  if (!candidates.length) return null;
  return candidates[
    Math.floor(deterministic01(timestamp, activity) * candidates.length) %
      candidates.length
  ];
}

export function maybeCreateWorldEvent(
  timestamp: number,
  timeZone: string,
): WorldEventSnapshot | null {
  const routine = resolveRoutine(timestamp, timeZone);
  if (!routine.isAwake || ["waking_up", "breakfast"].includes(routine.activity))
    return null;

  const chance = routine.availability === "occupied" ? 0.42 : 0.3;
  if (deterministic01(timestamp, "event-chance") > chance) return null;

  const template = chooseTemplate(routine.activity, timestamp);
  if (!template) return null;

  return {
    id: `world_${Math.floor(timestamp / 3_600_000)}_${template.kind}`,
    at: Math.floor(timestamp / 3_600_000) * 3_600_000,
    kind: template.kind,
    summary: template.summary,
    location: template.location ?? routine.location,
    activity: routine.activity,
    emotionalEffect: template.emotionalEffect,
    shareWorthiness: clampWorldEvent(template.shareWorthiness),
  };
}

// ---- world-engine.ts ----
const HOUR = 3_600_000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function createInitialWorldState(
  now = Date.now(),
  timeZone = resolveSystemTimeZone(),
): WorldState {
  const routine = resolveRoutine(now, timeZone);
  return {
    timeZone,
    currentLocation: routine.location,
    currentActivity: routine.activity,
    timeOfDay: resolveTimeOfDay(now, timeZone),
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
    if (typeof value !== "number") continue;
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
    const event = maybeCreateWorldEvent(at, state.timeZone);
    if (
      !event ||
      state.recentEvents.some((existing) => existing.id === event.id) ||
      generatedEvents.some((existing) => existing.id === event.id)
    )
      continue;
    generatedEvents.push(event);
    mergeDelta(emotionDelta, event.emotionalEffect);
  }

  const currentRoutine = resolveRoutine(now, state.timeZone);
  const targetEnergyAdjustment =
    (currentRoutine.targetEnergy - emotion.energy) *
    (1 - Math.exp(-0.16 * elapsedHours));
  emotionDelta.energy = (emotionDelta.energy ?? 0) + targetEnergyAdjustment;

  const hoursSinceUser = Math.max(
    0,
    (now - state.lastUserInteractionAt) / HOUR,
  );
  const desiredConnection = clamp(
    0.08 + Math.min(0.42, hoursSinceUser * 0.015),
  );
  const connectionDrive = clamp(
    state.connectionDrive +
      (desiredConnection - state.connectionDrive) *
        (1 - Math.exp(-elapsedHours / 6)),
  );

  if (elapsedHours > 8 && generatedEvents.length === 0) {
    emotionDelta.curiosity = (emotionDelta.curiosity ?? 0) + 0.008;
  }

  const recentEvents = uniqueEvents([
    ...state.recentEvents,
    ...generatedEvents,
  ]).slice(-6);
  const lastMeaningful = [...generatedEvents]
    .reverse()
    .find((event) => event.shareWorthiness >= 0.5);

  return {
    emotionDelta,
    generatedEvents,
    world: {
      ...state,
      currentLocation: currentRoutine.location,
      currentActivity: currentRoutine.activity,
      timeOfDay: resolveTimeOfDay(now, state.timeZone),
      availability: currentRoutine.availability,
      isAwake: currentRoutine.isAwake,
      connectionDrive,
      lastSimulatedAt: now,
      lastMeaningfulWorldEventAt:
        lastMeaningful?.at ?? state.lastMeaningfulWorldEventAt,
      recentEvents,
      updatedAt: now,
    },
  };
}

export function applyWorldSimulationEmotion(
  emotion: EmotionalState,
  simulation: WorldSimulationResult,
  now = Date.now(),
) {
  return applyEmotionDelta(emotion, simulation.emotionDelta, now);
}

export function markUserInteraction(
  world: WorldState,
  now = Date.now(),
  options: { engaged?: boolean } = {},
): WorldState {
  const engaged = options.engaged ?? true;

  if (!engaged) {
    return {
      ...world,
      connectionDrive: Math.max(0.04, world.connectionDrive * 0.8),
      lastUserInteractionAt: now,
      updatedAt: now,
    };
  }

  if (world.availability === "occupied") {
    return {
      ...world,
      connectionDrive: Math.max(0.04, world.connectionDrive * 0.5),
      lastUserInteractionAt: now,
      updatedAt: now,
    };
  }

  return {
    ...world,
    currentActivity: "chatting",
    availability: "free",
    isAwake: true,
    connectionDrive: Math.max(0.04, world.connectionDrive * 0.35),
    lastUserInteractionAt: now,
    updatedAt: now,
  };
}
