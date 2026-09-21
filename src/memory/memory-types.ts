export type MemoryKind = 'working' | 'short_term' | 'episodic' | 'semantic';
export type MemoryStatus = 'active' | 'outdated' | 'archived';

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  summary: string;
  sourceEventIds: string[];
  topics: string[];
  importance: number;
  confidence: number;
  emotionalWeight: number;
  retrievalStrength: number;
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  validFrom?: number;
  validUntil?: number;
  supersedesMemoryId?: string;
  contradictionGroup?: string;
  status: MemoryStatus;
}

export type KnowledgeSubject = 'user' | 'character' | 'relationship' | 'world';
export type KnowledgeStatus = 'active' | 'outdated' | 'disputed';

export interface KnowledgeFact {
  id: string;
  subject: KnowledgeSubject;
  /** Stable logical key, for example user.residence or user.preference.coffee. */
  key: string;
  statement: string;
  value: string;
  confidence: number;
  evidenceCount: number;
  sourceEventIds: string[];
  sourceMemoryIds: string[];
  createdAt: number;
  updatedAt: number;
  lastConfirmedAt: number;
  validFrom: number;
  validUntil?: number;
  status: KnowledgeStatus;
  supersededByFactId?: string;
}

export type OpenThreadStatus = 'open' | 'resolved' | 'dropped';

export interface OpenThread {
  id: string;
  topic: string;
  summary: string;
  priority: number;
  sourceEventIds: string[];
  createdAt: number;
  updatedAt: number;
  lastTouchedAt: number;
  status: OpenThreadStatus;
  resolvedAt?: number;
}

export interface MemoryContext {
  memories: MemoryRecord[];
  facts: KnowledgeFact[];
  openThreads: OpenThread[];
}

export interface MemoryConsolidationReport {
  processedEventIds: string[];
  memoriesCreated: string[];
  factsCreated: string[];
  factsConfirmed: string[];
  factsOutdated: string[];
  threadsCreated: string[];
  threadsResolved: string[];
  memoriesArchived: string[];
}
