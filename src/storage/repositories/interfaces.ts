import type { CharacterEvent } from "../../events/event-types";
import type { EmotionalState } from "../../emotions/emotions";
import type { RelationshipState } from "../../relationship/relationship";
import type {
  KnowledgeFact,
  KnowledgeStatus,
  MemoryKind,
  MemoryRecord,
  MemoryStatus,
  OpenThread,
  OpenThreadStatus,
} from "../../memory/model";
import type { WorldState } from "../../world/world";
import type { CharacterInitiative } from "../../initiative/initiative";
import type { IntimacyPreferencesDocument, IntimacyState } from "../../intimacy/intimacy";

import type { RomanceState } from "../../relationship/relationship";
import type { YuzukiEditableContext, YuzukiEditableContextPatch } from "../../context/yuzuki-context";

export interface CompanionSnapshot {
  romance?: RomanceState;
  appearance?: import("../../avatar/avatar-model").AppearanceState;
  revision?: number;
  emotion: EmotionalState;
  relationship: RelationshipState;
}

export interface RuntimePersistenceState {
  snapshot: CompanionSnapshot | null;
  world: WorldState | null;
}

export interface EventRecoveryCursor {
  timestamp: number;
  id: string;
}

export interface ConversationCursor {
  timestamp: number;
  id: string;
}

export interface ConversationPage {
  events: CharacterEvent[];
  nextCursor: ConversationCursor | null;
  hasMore: boolean;
}

export interface MemoryRecoveryState {
  processorVersion: number;
  cursor: EventRecoveryCursor | null;
  backfillComplete: boolean;
  updatedAt: number;
}

export interface KnowledgeMergeResult {
  activeFact: KnowledgeFact;
  candidateFact: KnowledgeFact;
  outcome: "created" | "confirmed" | "historical";
  supersededFacts: KnowledgeFact[];
}

export interface CompanionRepository {
  getEvent(id: string): Promise<CharacterEvent | null>;
  commitTurn(
    events: CharacterEvent[],
    snapshot: CompanionSnapshot,
    world: WorldState,
    expectedRevision: number,
  ): Promise<void>;
  appendEvent(event: CharacterEvent): Promise<void>;
  listPendingTurns(limit?: number): Promise<CharacterEvent[]>;
  dismissPendingTurn(messageId: string): Promise<void>;
  listRecentEvents(limit?: number): Promise<CharacterEvent[]>;
  listConversationEvents(options?: {
    before?: ConversationCursor | null;
    limit?: number;
  }): Promise<ConversationPage>;
  listEventsForMemoryBackfill(options?: {
    after?: EventRecoveryCursor | null;
    limit?: number;
  }): Promise<CharacterEvent[]>;
  listPendingMemoryEvents(limit?: number): Promise<CharacterEvent[]>;
  loadMemoryRecoveryState(): Promise<MemoryRecoveryState | null>;
  saveMemoryRecoveryState(state: MemoryRecoveryState): Promise<void>;
  listConsolidatedEventIds(since: number): Promise<string[]>;
  isEventConsolidated(eventId: string): Promise<boolean>;
  markEventConsolidated(eventId: string, timestamp: number): Promise<void>;
  loadRuntimeState(): Promise<RuntimePersistenceState>;
  loadSnapshot(): Promise<CompanionSnapshot | null>;
  loadWorldState(): Promise<WorldState | null>;
  resetConversationAndMemory(
    snapshot: CompanionSnapshot,
    world: WorldState,
  ): Promise<RuntimePersistenceState>;

  loadEditableContext(): Promise<YuzukiEditableContext | null>;
  saveEditableContext(context: YuzukiEditableContext): Promise<YuzukiEditableContext>;
  updateEditableContext(patch: YuzukiEditableContextPatch): Promise<YuzukiEditableContext>;

  loadIntimacyState(): Promise<IntimacyState | null>;
  commitIntimacyState(
    state: IntimacyState,
    expectedRevision: number,
  ): Promise<IntimacyState>;
  loadIntimacyPreferences(): Promise<IntimacyPreferencesDocument | null>;
  commitIntimacyPreferences(
    preferences: IntimacyPreferencesDocument,
    expectedRevision: number,
  ): Promise<IntimacyPreferencesDocument>;

  listInitiatives(options?: { limit?: number }): Promise<CharacterInitiative[]>;
  saveInitiative(initiative: CharacterInitiative): Promise<void>;

  getMemory(id: string): Promise<MemoryRecord | null>;
  listMemories(options?: {
    includeArchived?: boolean;
    limit?: number;
    sortBy?: "updatedAt" | "importance" | "createdAt";
    direction?: "asc" | "desc";
    statuses?: MemoryStatus[];
    kinds?: MemoryKind[];
    topicsAny?: string[];
  }): Promise<MemoryRecord[]>;
  saveMemory(memory: MemoryRecord): Promise<void>;
  reinforceMemories(memoryIds: string[], now: number): Promise<void>;

  listKnowledgeFacts(options?: {
    key?: string;
    statuses?: KnowledgeStatus[];
    limit?: number;
  }): Promise<KnowledgeFact[]>;
  saveKnowledgeFact(fact: KnowledgeFact): Promise<void>;
  mergeKnowledgeFact(fact: KnowledgeFact): Promise<KnowledgeMergeResult>;

  listOpenThreads(options?: {
    statuses?: OpenThreadStatus[];
    limit?: number;
  }): Promise<OpenThread[]>;
  saveOpenThread(thread: OpenThread): Promise<void>;
}
