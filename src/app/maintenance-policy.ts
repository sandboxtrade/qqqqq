import type { CharacterInitiative } from "../initiative/initiative-types";
import { resolveRoutine } from "../world/time-engine";
import type { WorldState } from "../world/world-types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const USER_QUIET_WINDOW = 10 * MINUTE;
const RETRY_DELAYS = [5_000, 15_000, 30_000, 60_000, 120_000] as const;

export function maintenanceRetryDelay(attempt: number) {
  const index = Math.max(0, Math.min(RETRY_DELAYS.length - 1, Math.floor(attempt) - 1));
  return RETRY_DELAYS[index];
}

export function nextAwakeTimestamp(world: WorldState, from: number) {
  if (resolveRoutine(from, world.timeZone).isAwake) return from;
  // Routine boundaries are hour-based. Fifteen-minute sampling keeps the timer
  // bounded without requiring timezone arithmetic of our own.
  for (let offset = 15 * MINUTE; offset <= 30 * HOUR; offset += 15 * MINUTE) {
    const at = from + offset;
    if (resolveRoutine(at, world.timeZone).isAwake) return at;
  }
  return from + HOUR;
}

export function nextInitiativeCheckAt(
  initiatives: CharacterInitiative[],
  world: WorldState,
  now: number,
) {
  const quietAfter = world.lastUserInteractionAt + USER_QUIET_WINDOW;
  const pendingTargets = initiatives
    .filter((initiative) => initiative.status === "pending" && initiative.expiresAt > now)
    .map((initiative) => {
      const readyAt = Math.max(now, quietAfter, initiative.notBefore);
      const awakeAt = nextAwakeTimestamp(world, readyAt);
      return awakeAt < initiative.expiresAt ? awakeAt : Number.POSITIVE_INFINITY;
    })
    .filter(Number.isFinite);

  if (pendingTargets.length) return Math.min(...pendingTargets);

  // Even with an empty queue, some candidates become eligible solely because
  // time passes. Schedule the next meaningful threshold instead of polling.
  const oneHour = world.lastUserInteractionAt + HOUR;
  const eightHours = world.lastUserInteractionAt + 8 * HOUR;
  let reevaluateAt: number;
  if (now < oneHour) reevaluateAt = oneHour;
  else if (now < eightHours) reevaluateAt = Math.min(eightHours, now + HOUR);
  else reevaluateAt = now + HOUR;
  return nextAwakeTimestamp(world, Math.max(now, reevaluateAt));
}
