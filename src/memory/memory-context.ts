import type { CompanionRepository } from "../storage/repositories/interfaces";
import type { KnowledgeFact, MemoryContext, MemoryRecord, OpenThread } from "./memory-types";
import { decayMemory } from "./memory-decay";
import {
  factKeysForQuery,
  isBroadRecallQuery,
  rankFacts,
  rankMemories,
  rankOpenThreads,
  topicQueryTerms,
} from "./memory-retrieval";

function mergeById<T extends { id: string }>(...groups: T[][]) {
  const unique = new Map<string, T>();
  for (const group of groups)
    for (const item of group) unique.set(item.id, item);
  return [...unique.values()];
}

async function safeTopicMemories(
  repository: CompanionRepository,
  topics: string[],
): Promise<MemoryRecord[]> {
  if (!topics.length) return [];
  try {
    return await repository.listMemories({
      statuses: ["active"],
      topicsAny: topics,
      limit: 48,
      sortBy: "updatedAt",
      direction: "desc",
    });
  } catch {
    // A newly deployed Firestore index can take time to become ready. Topic
    // lookup is an accelerator, not a hard dependency for chat availability.
    return [];
  }
}

async function factsForKeys(
  repository: CompanionRepository,
  keys: string[],
): Promise<KnowledgeFact[]> {
  if (!keys.length) return [];
  const groups = await Promise.all(
    keys.map((key) =>
      repository.listKnowledgeFacts({ key, statuses: ["active"], limit: 4 }),
    ),
  );
  return mergeById(...groups);
}

export async function retrieveMemoryContext(
  query: string,
  repository: CompanionRepository,
  now = Date.now(),
): Promise<MemoryContext> {
  const broadRecall = isBroadRecallQuery(query);
  const topics = broadRecall ? [] : topicQueryTerms(query);
  const factKeys = factKeysForQuery(query);

  const [recentMemories, importantMemories, topicMemories, recentFacts, keyedFacts, recentThreads] =
    await Promise.all([
      repository.listMemories({
        statuses: ["active"],
        limit: 72,
        sortBy: "updatedAt",
        direction: "desc",
      }),
      repository.listMemories({
        statuses: ["active"],
        limit: 36,
        sortBy: "importance",
        direction: "desc",
      }),
      safeTopicMemories(repository, topics),
      repository.listKnowledgeFacts({ statuses: ["active"], limit: 72 }),
      factsForKeys(repository, factKeys),
      repository.listOpenThreads({ statuses: ["open"], limit: 36 }),
    ]);

  let memoryPool = mergeById(recentMemories, importantMemories, topicMemories);
  let factPool = mergeById(recentFacts, keyedFacts);
  let threadPool = recentThreads;

  let memories = rankMemories(
    query,
    memoryPool.map((memory) => decayMemory(memory, now)),
    now,
    8,
  );
  let facts = rankFacts(query, factPool, now, 6);
  let openThreads = rankOpenThreads(query, threadPool, now, 4);

  // The common path stays small. Expanded reads are only a fallback for a
  // specific query that found nothing in the targeted/recent windows.
  const fallbacks: Array<Promise<void>> = [];
  if (!broadRecall && memories.length === 0 && topics.length > 0) {
    fallbacks.push(
      Promise.all([
        repository.listMemories({
          statuses: ["active"],
          limit: 180,
          sortBy: "updatedAt",
          direction: "desc",
        }),
        repository.listMemories({
          statuses: ["active"],
          limit: 80,
          sortBy: "importance",
          direction: "desc",
        }),
      ]).then(([olderRecent, olderImportant]) => {
        memoryPool = mergeById(memoryPool, olderRecent, olderImportant);
        memories = rankMemories(
          query,
          memoryPool.map((memory) => decayMemory(memory, now)),
          now,
          8,
        );
      }),
    );
  }
  if (!broadRecall && facts.length === 0 && !factKeys.length && topics.length > 0 && recentFacts.length >= 72) {
    fallbacks.push(
      repository
        .listKnowledgeFacts({ statuses: ["active"], limit: 180 })
        .then((olderFacts) => {
          factPool = mergeById(factPool, olderFacts);
          facts = rankFacts(query, factPool, now, 6);
        }),
    );
  }
  if (!broadRecall && openThreads.length === 0 && topics.length > 0 && recentThreads.length >= 36) {
    fallbacks.push(
      repository
        .listOpenThreads({ statuses: ["open"], limit: 120 })
        .then((olderThreads) => {
          threadPool = mergeById(threadPool, olderThreads);
          openThreads = rankOpenThreads(query, threadPool, now, 4);
        }),
    );
  }
  if (fallbacks.length) await Promise.all(fallbacks);

  return { memories, facts, openThreads };
}
