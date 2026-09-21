import type { KnowledgeFact, MemoryRecord, OpenThread } from './memory-types';

export function normalizeMemoryRecord(memory: MemoryRecord): MemoryRecord {
  const createdAt = Number(memory.createdAt) || Date.now();
  return {
    ...memory,
    sourceEventIds: Array.isArray(memory.sourceEventIds) ? memory.sourceEventIds : [],
    topics: Array.isArray(memory.topics) ? memory.topics : [],
    importance: Number.isFinite(memory.importance) ? memory.importance : 0.4,
    confidence: Number.isFinite(memory.confidence) ? memory.confidence : 0.7,
    emotionalWeight: Number.isFinite(memory.emotionalWeight) ? memory.emotionalWeight : 0.2,
    retrievalStrength: Number.isFinite(memory.retrievalStrength) ? memory.retrievalStrength : 0.5,
    accessCount: Number.isFinite(memory.accessCount) ? memory.accessCount : 0,
    createdAt,
    updatedAt: Number(memory.updatedAt) || createdAt,
    lastAccessedAt: Number(memory.lastAccessedAt) || createdAt,
    validFrom: Number(memory.validFrom) || createdAt,
    status: memory.status ?? 'active',
  };
}

export function normalizeKnowledgeFact(fact: KnowledgeFact): KnowledgeFact {
  const createdAt = Number(fact.createdAt) || Date.now();
  return {
    ...fact,
    sourceEventIds: Array.isArray(fact.sourceEventIds) ? fact.sourceEventIds : [],
    sourceMemoryIds: Array.isArray(fact.sourceMemoryIds) ? fact.sourceMemoryIds : [],
    confidence: Number.isFinite(fact.confidence) ? fact.confidence : 0.65,
    evidenceCount: Number.isFinite(fact.evidenceCount) ? fact.evidenceCount : 1,
    createdAt,
    updatedAt: Number(fact.updatedAt) || createdAt,
    lastConfirmedAt: Number(fact.lastConfirmedAt) || createdAt,
    validFrom: Number(fact.validFrom) || createdAt,
    status: fact.status ?? 'active',
  };
}

export function normalizeOpenThread(thread: OpenThread): OpenThread {
  const createdAt = Number(thread.createdAt) || Date.now();
  return {
    ...thread,
    sourceEventIds: Array.isArray(thread.sourceEventIds) ? thread.sourceEventIds : [],
    priority: Number.isFinite(thread.priority) ? thread.priority : 0.5,
    createdAt,
    updatedAt: Number(thread.updatedAt) || createdAt,
    lastTouchedAt: Number(thread.lastTouchedAt) || createdAt,
    status: thread.status ?? (thread.resolvedAt ? 'resolved' : 'open'),
  };
}
