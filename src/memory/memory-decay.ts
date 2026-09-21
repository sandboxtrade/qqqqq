import type { MemoryRecord } from './memory-types';

const DAY = 86_400_000;

function halfLifeDays(memory: MemoryRecord) {
  const base = memory.kind === 'short_term' ? 5 : memory.kind === 'episodic' ? 120 : memory.kind === 'semantic' ? 365 : 2;
  const importanceMultiplier = 0.65 + memory.importance * 1.9;
  const emotionalMultiplier = 0.85 + memory.emotionalWeight * 0.7;
  return base * importanceMultiplier * emotionalMultiplier;
}

export function decayMemory(memory: MemoryRecord, now = Date.now()): MemoryRecord {
  if (memory.status !== 'active') return memory;
  const elapsedDays = Math.max(0, (now - memory.updatedAt) / DAY);
  if (elapsedDays < 0.25) return memory;

  const halfLife = halfLifeDays(memory);
  const decayFactor = Math.pow(0.5, elapsedDays / Math.max(0.5, halfLife));
  const retrievalStrength = Math.max(0.01, Math.min(1, memory.retrievalStrength * decayFactor));
  const shouldArchive =
    memory.kind !== 'semantic' &&
    retrievalStrength < 0.075 &&
    memory.importance < 0.62 &&
    memory.emotionalWeight < 0.55;

  return {
    ...memory,
    retrievalStrength,
    updatedAt: now,
    status: shouldArchive ? 'archived' : memory.status,
  };
}

export function reinforceMemory(memory: MemoryRecord, now = Date.now()): MemoryRecord {
  return {
    ...memory,
    retrievalStrength: Math.min(1, memory.retrievalStrength + 0.08 + memory.importance * 0.04),
    accessCount: memory.accessCount + 1,
    lastAccessedAt: now,
    updatedAt: now,
  };
}
