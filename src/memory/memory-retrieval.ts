import type { KnowledgeFact, MemoryRecord, OpenThread } from './memory-types';

const DAY = 86_400_000;

function normalizeToken(token: string) {
  let value = token.toLowerCase();
  if (/^[а-яё]+$/u.test(value) && value.length > 4) {
    value = value.replace(/(иями|ями|ами|ого|ему|ому|ыми|ими|ах|ях|ов|ев|ей|ам|ям|ом|ем|ой|ый|ий|ая|яя|ое|ее|ые|ие|ы|и|а|я|у|ю|е|о)$/u, '');
  }
  return value;
}

export const textTokens = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map(normalizeToken)
      .filter((token) => token.length > 1),
  );

function overlapScore(query: Set<string>, text: string) {
  if (!query.size) return 0;
  const candidate = textTokens(text);
  if (!candidate.size) return 0;
  const overlap = [...query].filter((token) => candidate.has(token)).length;
  return overlap / Math.max(1, Math.min(query.size, candidate.size));
}

export function rankMemories(query: string, memories: MemoryRecord[], now = Date.now(), limit = 8): MemoryRecord[] {
  const queryTokens = textTokens(query);
  return memories
    .filter((memory) => memory.status === 'active')
    .map((memory) => {
      const semanticProxy = overlapScore(queryTokens, `${memory.summary} ${memory.topics.join(' ')}`);
      const ageDays = Math.max(0, (now - memory.createdAt) / DAY);
      const accessedDays = Math.max(0, (now - memory.lastAccessedAt) / DAY);
      const recency = Math.exp(-ageDays / 45);
      const accessRecency = Math.exp(-accessedDays / 30);
      const score =
        semanticProxy * 0.4 +
        memory.importance * 0.2 +
        recency * 0.09 +
        memory.emotionalWeight * 0.1 +
        memory.retrievalStrength * 0.15 +
        accessRecency * 0.06;
      return { memory, score };
    })
    .filter(({ score, memory }) => score > 0.12 || memory.importance > 0.8)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ memory }) => memory);
}

export function rankFacts(query: string, facts: KnowledgeFact[], now = Date.now(), limit = 6): KnowledgeFact[] {
  const queryTokens = textTokens(query);
  return facts
    .filter((fact) => fact.status === 'active')
    .map((fact) => {
      const semantic = overlapScore(queryTokens, `${fact.key} ${fact.statement} ${fact.value}`);
      const ageDays = Math.max(0, (now - fact.lastConfirmedAt) / DAY);
      const freshness = Math.exp(-ageDays / 180);
      const score = semantic * 0.62 + fact.confidence * 0.28 + freshness * 0.1;
      return { fact, score };
    })
    .filter(({ score }) => score > 0.18)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ fact }) => fact);
}

export function rankOpenThreads(query: string, threads: OpenThread[], now = Date.now(), limit = 4): OpenThread[] {
  const queryTokens = textTokens(query);
  return threads
    .filter((thread) => thread.status === 'open')
    .map((thread) => {
      const semantic = overlapScore(queryTokens, `${thread.topic} ${thread.summary}`);
      const ageDays = Math.max(0, (now - thread.lastTouchedAt) / DAY);
      const recency = Math.exp(-ageDays / 21);
      return { thread, score: semantic * 0.58 + thread.priority * 0.3 + recency * 0.12 };
    })
    .filter(({ score, thread }) => score > 0.2 || thread.priority > 0.78)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ thread }) => thread);
}
