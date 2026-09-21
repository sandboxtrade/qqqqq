import type { CompanionRepository } from '../storage/repositories/interfaces';
import type { MemoryContext } from './memory-types';
import { reinforceMemory } from './memory-decay';
import { rankFacts, rankMemories, rankOpenThreads } from './memory-retrieval';

export async function retrieveMemoryContext(query: string, repository: CompanionRepository, now = Date.now()): Promise<MemoryContext> {
  const [allMemories, allFacts, allThreads] = await Promise.all([
    repository.listMemories(),
    repository.listKnowledgeFacts(),
    repository.listOpenThreads(),
  ]);

  const memories = rankMemories(query, allMemories, now, 8);
  const facts = rankFacts(query, allFacts, now, 6);
  const openThreads = rankOpenThreads(query, allThreads, now, 4);

  const reinforced: typeof memories = [];
  for (const memory of memories) {
    const next = reinforceMemory(memory, now);
    await repository.saveMemory(next);
    reinforced.push(next);
  }

  return { memories: reinforced, facts, openThreads };
}
