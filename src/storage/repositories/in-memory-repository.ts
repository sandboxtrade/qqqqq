import type { CompanionRepository, CompanionSnapshot } from './interfaces';
import type { CharacterEvent } from '../../events/event-types';
import type { KnowledgeFact, MemoryRecord, OpenThread } from '../../memory/memory-types';
import type { WorldState } from '../../world/world-types';
import type { CharacterInitiative } from '../../initiative/initiative-types';

export class InMemoryCompanionRepository implements CompanionRepository {
  private events: CharacterEvent[] = [];
  private memories: MemoryRecord[] = [];
  private consolidatedEventIds = new Set<string>();
  private facts: KnowledgeFact[] = [];
  private threads: OpenThread[] = [];
  private snapshot: CompanionSnapshot | null = null;
  private world: WorldState | null = null;
  private initiatives: CharacterInitiative[] = [];

  async appendEvent(event: CharacterEvent) {
    const copy = structuredClone(event);
    const index = this.events.findIndex((item) => item.id === event.id);
    if (index >= 0) this.events[index] = copy;
    else this.events.push(copy);
  }
  async listRecentEvents(limit = 30) { return structuredClone(this.events.slice(-limit)); }
  async isEventConsolidated(eventId: string) { return this.consolidatedEventIds.has(eventId); }
  async markEventConsolidated(eventId: string) { this.consolidatedEventIds.add(eventId); }
  async loadSnapshot() { return this.snapshot ? structuredClone(this.snapshot) : null; }
  async saveSnapshot(snapshot: CompanionSnapshot) { this.snapshot = structuredClone(snapshot); }
  async loadWorldState() { return this.world ? structuredClone(this.world) : null; }
  async saveWorldState(world: WorldState) { this.world = structuredClone(world); }
  async listInitiatives(options?: { limit?: number }) {
    const max = options?.limit ?? 300;
    return structuredClone(this.initiatives.slice(-max));
  }
  async saveInitiative(initiative: CharacterInitiative) {
    this.initiatives = [...this.initiatives.filter((x) => x.id !== initiative.id), structuredClone(initiative)];
  }

  async listMemories(options?: { includeArchived?: boolean; limit?: number }) {
    const includeArchived = options?.includeArchived ?? false;
    const max = options?.limit ?? 600;
    const items = includeArchived ? this.memories : this.memories.filter((memory) => memory.status === 'active');
    return structuredClone(items.slice(-max));
  }
  async saveMemory(memory: MemoryRecord) {
    this.memories = [...this.memories.filter((x) => x.id !== memory.id), structuredClone(memory)];
  }

  async listKnowledgeFacts() { return structuredClone(this.facts); }
  async saveKnowledgeFact(fact: KnowledgeFact) {
    this.facts = [...this.facts.filter((x) => x.id !== fact.id), structuredClone(fact)];
  }

  async listOpenThreads() { return structuredClone(this.threads); }
  async saveOpenThread(thread: OpenThread) {
    this.threads = [...this.threads.filter((x) => x.id !== thread.id), structuredClone(thread)];
  }
}
