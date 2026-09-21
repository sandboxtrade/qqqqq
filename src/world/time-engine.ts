import type { Availability, TimeOfDay, WorldActivity, WorldLocation } from './world-types';

export function getLocalHour(timestamp: number) {
  return new Date(timestamp).getHours();
}

export function resolveTimeOfDay(timestamp: number): TimeOfDay {
  const hour = getLocalHour(timestamp);
  if (hour < 6) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
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

export function resolveRoutine(timestamp: number): RoutineSlot {
  const hour = getLocalHour(timestamp);

  if (hour < 6) {
    return { activity: 'sleeping', location: 'bedroom', availability: 'sleeping', isAwake: false, targetEnergy: 0.18 };
  }
  if (hour < 8) {
    return { activity: 'waking_up', location: 'bedroom', availability: 'resting', isAwake: true, targetEnergy: 0.42 };
  }
  if (hour < 10) {
    return { activity: 'breakfast', location: 'kitchen', availability: 'free', isAwake: true, targetEnergy: 0.66 };
  }
  if (hour < 13) {
    const activity = pick(['personal_project', 'reading'] as const, timestamp, 'late-morning');
    return { activity, location: activity === 'reading' ? 'living_room' : 'bedroom', availability: 'occupied', isAwake: true, targetEnergy: 0.72 };
  }
  if (hour < 15) {
    const activity = pick(['walk', 'cafe_break', 'errands'] as const, timestamp, 'midday');
    const location = activity === 'cafe_break' ? 'cafe' : 'outside';
    return { activity, location, availability: activity === 'cafe_break' ? 'free' : 'occupied', isAwake: true, targetEnergy: 0.66 };
  }
  if (hour < 18) {
    const activity = pick(['personal_project', 'reading', 'errands'] as const, timestamp, 'afternoon');
    const location = activity === 'errands' ? 'outside' : activity === 'reading' ? 'living_room' : 'bedroom';
    return { activity, location, availability: 'occupied', isAwake: true, targetEnergy: 0.58 };
  }
  if (hour < 21) {
    const activity = pick(['cooking', 'walk', 'music'] as const, timestamp, 'evening');
    const location = activity === 'cooking' ? 'kitchen' : activity === 'walk' ? 'outside' : 'living_room';
    return { activity, location, availability: 'free', isAwake: true, targetEnergy: 0.5 };
  }
  if (hour < 24) {
    const activity = pick(['reading', 'music', 'relaxing'] as const, timestamp, 'late-evening');
    return { activity, location: 'living_room', availability: 'resting', isAwake: true, targetEnergy: 0.34 };
  }

  return { activity: 'idle', location: 'unknown', availability: 'free', isAwake: true, targetEnergy: 0.5 };
}

export function clampElapsedMs(from: number, to: number, maxDays = 14) {
  const max = maxDays * 24 * 3_600_000;
  return Math.max(0, Math.min(to - from, max));
}
