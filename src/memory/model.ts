/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { CompanionRepository } from "../storage/repositories/interfaces";

// ---- memory-types.ts ----
export type MemoryKind = "working" | "short_term" | "episodic" | "semantic";
export type MemoryStatus = "active" | "outdated" | "archived";

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

export type KnowledgeSubject = "user" | "character" | "relationship" | "world";
export type KnowledgeStatus = "active" | "outdated" | "disputed";

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

export type CharacterViewPosition =
  | "positive"
  | "negative"
  | "mixed"
  | "cautious"
  | "curious";

export type CharacterViewReason =
  | "honesty"
  | "reciprocity"
  | "autonomy"
  | "consistency"
  | "comfort"
  | "curiosity"
  | "depth"
  | "respect"
  | "experience";

export interface CharacterViewValue {
  topic: string;
  position: CharacterViewPosition;
  reason: CharacterViewReason;
}

export function characterViewTopicKey(value: string) {
  const stem = (token: string) => {
    if (!/[а-я]/u.test(token) || token.length < 4) return token;
    return token
      .replace(/(?:иями|ями|ами|его|ого|ему|ому|ее|ие|ые|ое|ей|ий|ый|ой|ем|им|ым|ом|их|ых|ую|юю|ая|яя|ою|ею|ах|ях|ам|ям|ов|ев|ы|и|а|я|у|ю|е|о)$/u, "")
      .replace(/[ьъ]$/u, "") || token;
  };
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/gu, "е")
    .split(/[^\p{L}\p{N}]+/gu)
    .filter(Boolean)
    .map(stem)
    .join("_")
    .slice(0, 64);
}

/**
 * Additive event payload produced by Local Brain when a thought is stable
 * enough to survive the current turn. It is stored inside the existing event
 * payload and later consolidated into ordinary KnowledgeFact records; no new
 * Firestore collection or persistence schema is required.
 */
export interface CharacterMindContinuityPayload extends CharacterViewValue {
  topicKey: string;
  confidence: number;
  persistence: number;
  reconsideration?: string;
  challengeDirection?: "positive" | "negative";
  changedFrom?: CharacterViewPosition;
}

export function encodeCharacterViewValue(value: CharacterViewValue) {
  return `v1|${value.position}|${value.reason}|${encodeURIComponent(value.topic.trim())}`;
}

export function decodeCharacterViewValue(value: string): CharacterViewValue | null {
  const [version, position, reason, encodedTopic] = value.split("|");
  const positions: CharacterViewPosition[] = ["positive", "negative", "mixed", "cautious", "curious"];
  const reasons: CharacterViewReason[] = [
    "honesty", "reciprocity", "autonomy", "consistency", "comfort",
    "curiosity", "depth", "respect", "experience",
  ];
  if (version !== "v1" || !positions.includes(position as CharacterViewPosition) ||
      !reasons.includes(reason as CharacterViewReason) || !encodedTopic) return null;
  try {
    const topic = decodeURIComponent(encodedTopic).trim();
    if (!topic) return null;
    return {
      topic,
      position: position as CharacterViewPosition,
      reason: reason as CharacterViewReason,
    };
  } catch {
    return null;
  }
}

export type OpenThreadStatus = "open" | "resolved" | "dropped";

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
  memoriesOutdated: string[];
}

// ---- memory-normalize.ts ----
export function normalizeMemoryRecord(memory: MemoryRecord): MemoryRecord {
  const createdAt = Number(memory.createdAt) || Date.now();
  return {
    ...memory,
    sourceEventIds: Array.isArray(memory.sourceEventIds)
      ? memory.sourceEventIds
      : [],
    topics: Array.isArray(memory.topics) ? memory.topics : [],
    importance: Number.isFinite(memory.importance) ? memory.importance : 0.4,
    confidence: Number.isFinite(memory.confidence) ? memory.confidence : 0.7,
    emotionalWeight: Number.isFinite(memory.emotionalWeight)
      ? memory.emotionalWeight
      : 0.2,
    retrievalStrength: Number.isFinite(memory.retrievalStrength)
      ? memory.retrievalStrength
      : 0.5,
    accessCount: Number.isFinite(memory.accessCount) ? memory.accessCount : 0,
    createdAt,
    updatedAt: Number(memory.updatedAt) || createdAt,
    lastAccessedAt: Number(memory.lastAccessedAt) || createdAt,
    validFrom: Number(memory.validFrom) || createdAt,
    status: memory.status ?? "active",
  };
}

export function normalizeKnowledgeFact(fact: KnowledgeFact): KnowledgeFact {
  const createdAt = Number(fact.createdAt) || Date.now();
  return {
    ...fact,
    sourceEventIds: Array.isArray(fact.sourceEventIds)
      ? fact.sourceEventIds
      : [],
    sourceMemoryIds: Array.isArray(fact.sourceMemoryIds)
      ? fact.sourceMemoryIds
      : [],
    confidence: Number.isFinite(fact.confidence) ? fact.confidence : 0.65,
    evidenceCount: Number.isFinite(fact.evidenceCount) ? fact.evidenceCount : 1,
    createdAt,
    updatedAt: Number(fact.updatedAt) || createdAt,
    lastConfirmedAt: Number(fact.lastConfirmedAt) || createdAt,
    validFrom: Number(fact.validFrom) || createdAt,
    status: fact.status ?? "active",
  };
}

export function normalizeOpenThread(thread: OpenThread): OpenThread {
  const createdAt = Number(thread.createdAt) || Date.now();
  return {
    ...thread,
    sourceEventIds: Array.isArray(thread.sourceEventIds)
      ? thread.sourceEventIds
      : [],
    priority: Number.isFinite(thread.priority) ? thread.priority : 0.5,
    createdAt,
    updatedAt: Number(thread.updatedAt) || createdAt,
    lastTouchedAt: Number(thread.lastTouchedAt) || createdAt,
    status: thread.status ?? (thread.resolvedAt ? "resolved" : "open"),
  };
}

// ---- memory-decay.ts ----
const DAY = 86_400_000;

function halfLifeDays(memory: MemoryRecord) {
  const base =
    memory.kind === "short_term"
      ? 5
      : memory.kind === "episodic"
        ? 120
        : memory.kind === "semantic"
          ? 365
          : 2;
  const importanceMultiplier = 0.65 + memory.importance * 1.9;
  const emotionalMultiplier = 0.85 + memory.emotionalWeight * 0.7;
  return base * importanceMultiplier * emotionalMultiplier;
}

export function decayMemory(
  memory: MemoryRecord,
  now = Date.now(),
): MemoryRecord {
  if (memory.status !== "active") return memory;
  const elapsedDays = Math.max(0, (now - memory.updatedAt) / DAY);
  if (elapsedDays < 0.25) return memory;

  const halfLife = halfLifeDays(memory);
  const decayFactor = Math.pow(0.5, elapsedDays / Math.max(0.5, halfLife));
  const retrievalStrength = Math.max(
    0.01,
    Math.min(1, memory.retrievalStrength * decayFactor),
  );


  return {
    ...memory,
    retrievalStrength,
    updatedAt: now,
    status: memory.status,
  };
}

export function reinforceMemory(
  memory: MemoryRecord,
  now = Date.now(),
): MemoryRecord {
  return {
    ...memory,
    retrievalStrength: Math.min(
      1,
      memory.retrievalStrength + 0.08 + memory.importance * 0.04,
    ),
    accessCount: memory.accessCount + 1,
    lastAccessedAt: now,
    updatedAt: now,
  };
}

// ---- memory-health.ts ----
export interface MemoryHealthSnapshot {
  activeMemories: number;
  episodicMemories: number;
  shortTermMemories: number;
  archivedMemories: number;
  activeFacts: number;
  outdatedFacts: number;
  openThreads: number;
}

export async function getMemoryHealth(
  repository: CompanionRepository,
): Promise<MemoryHealthSnapshot> {
  const [activeMemories, historicalMemories, activeFacts, outdatedFacts, openThreads] =
    await Promise.all([
      repository.listMemories({ statuses: ["active"], limit: 1200 }),
      repository.listMemories({
        statuses: ["archived", "outdated"],
        includeArchived: true,
        limit: 1200,
      }),
      repository.listKnowledgeFacts({ statuses: ["active"], limit: 600 }),
      repository.listKnowledgeFacts({ statuses: ["outdated"], limit: 600 }),
      repository.listOpenThreads({ statuses: ["open"], limit: 300 }),
    ]);

  return {
    activeMemories: activeMemories.length,
    episodicMemories: activeMemories.filter((m) => m.kind === "episodic").length,
    shortTermMemories: activeMemories.filter((m) => m.kind === "short_term").length,
    archivedMemories: historicalMemories.filter((m) => m.status === "archived").length,
    activeFacts: activeFacts.length,
    outdatedFacts: outdatedFacts.length,
    openThreads: openThreads.length,
  };
}
