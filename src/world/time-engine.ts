import type {
  Availability,
  TimeOfDay,
  WorldActivity,
  WorldLocation,
} from "./world-types";

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
