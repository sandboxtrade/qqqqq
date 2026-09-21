import type { CompanionRepository } from '../storage/repositories/interfaces';

export interface MemoryHealthSnapshot {
  activeMemories: number;
  episodicMemories: number;
  shortTermMemories: number;
  archivedMemories: number;
  activeFacts: number;
  outdatedFacts: number;
  openThreads: number;
}

export async function getMemoryHealth(repository: CompanionRepository): Promise<MemoryHealthSnapshot> {
  const [memories, facts, threads] = await Promise.all([
    repository.listMemories({ includeArchived: true, limit: 1200 }),
    repository.listKnowledgeFacts(),
    repository.listOpenThreads(),
  ]);

  return {
    activeMemories: memories.filter((m) => m.status === 'active').length,
    episodicMemories: memories.filter((m) => m.status === 'active' && m.kind === 'episodic').length,
    shortTermMemories: memories.filter((m) => m.status === 'active' && m.kind === 'short_term').length,
    archivedMemories: memories.filter((m) => m.status === 'archived').length,
    activeFacts: facts.filter((f) => f.status === 'active').length,
    outdatedFacts: facts.filter((f) => f.status === 'outdated').length,
    openThreads: threads.filter((t) => t.status === 'open').length,
  };
}
