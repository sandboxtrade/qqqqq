import type { CharacterEvent } from '../../events/event-types';
import type { EmotionalState } from '../../emotions/emotion-types';
import type { RelationshipState } from '../../relationship/relationship-types';
import type { KnowledgeFact, MemoryRecord, OpenThread } from '../../memory/memory-types';
import type { WorldState } from '../../world/world-types';
import type { CharacterInitiative } from '../../initiative/initiative-types';

export interface CompanionSnapshot {
  emotion: EmotionalState;
  relationship: RelationshipState;
}

export interface CompanionRepository {
  appendEvent(event: CharacterEvent): Promise<void>;
  listRecentEvents(limit?: number): Promise<CharacterEvent[]>;
  isEventConsolidated(eventId: string): Promise<boolean>;
  markEventConsolidated(eventId: string, timestamp: number): Promise<void>;
  loadSnapshot(): Promise<CompanionSnapshot | null>;
  saveSnapshot(snapshot: CompanionSnapshot): Promise<void>;

  loadWorldState(): Promise<WorldState | null>;
  saveWorldState(world: WorldState): Promise<void>;

  listInitiatives(options?: { limit?: number }): Promise<CharacterInitiative[]>;
  saveInitiative(initiative: CharacterInitiative): Promise<void>;

  listMemories(options?: { includeArchived?: boolean; limit?: number }): Promise<MemoryRecord[]>;
  saveMemory(memory: MemoryRecord): Promise<void>;

  listKnowledgeFacts(): Promise<KnowledgeFact[]>;
  saveKnowledgeFact(fact: KnowledgeFact): Promise<void>;

  listOpenThreads(): Promise<OpenThread[]>;
  saveOpenThread(thread: OpenThread): Promise<void>;
}
