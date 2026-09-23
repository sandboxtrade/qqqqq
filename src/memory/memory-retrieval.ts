import type { KnowledgeFact, MemoryRecord, OpenThread } from "./memory-types";

const DAY = 86_400_000;

function normalizeToken(token: string) {
  let value = token.toLowerCase();
  if (/^[а-яё]+$/u.test(value) && value.length > 4) {
    value = value.replace(
      /(иями|ями|ами|ого|ему|ому|ыми|ими|ах|ях|ов|ев|ей|ам|ям|ом|ем|ой|ый|ий|ая|яя|ое|ее|ые|ие|ы|и|а|я|у|ю|е|о)$/u,
      "",
    );
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

/** Exact lower-case words used for Firestore array-contains-any topic lookup. */
export const topicQueryTerms = (text: string) =>
  [...new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 4),
  )].slice(0, 10);

function overlapScore(query: Set<string>, text: string) {
  if (!query.size) return 0;
  const candidate = textTokens(text);
  if (!candidate.size) return 0;
  const overlap = [...query].filter((token) => candidate.has(token)).length;
  return overlap / Math.max(1, Math.min(query.size, candidate.size));
}

export function isBroadRecallQuery(query: string) {
  return /(помнишь|помнишь\s+ли|что\s+ты\s+помнишь|напомни|мы\s+(?:обсуждали|говорили)|что\s+я\s+(?:говорил|рассказывал)|раньше\s+(?:говорил|рассказывал)|remember|what\s+do\s+you\s+remember|remind|talked\s+about)/iu.test(
    query,
  );
}

export function factKeysForQuery(query: string): string[] {
  const keys: string[] = [];
  const add = (key: string) => {
    if (!keys.includes(key)) keys.push(key);
  };
  if (/(как\s+меня\s+зовут|мо[её]\s+имя|my\s+name|what(?:'s|\s+is)\s+my\s+name)/iu.test(query))
    add("user.name");
  if (/(сколько\s+мне\s+лет|мой\s+возраст|how\s+old\s+am\s+i|my\s+age)/iu.test(query))
    add("user.age");
  if (/(где\s+я\s+живу|живу\s+где|мой\s+город|место\s+жительств|where\s+do\s+i\s+live|where\s+i\s+live)/iu.test(query))
    add("user.residence");
  if (/(где\s+я\s+работаю|кем\s+я\s+работаю|моя\s+работа|where\s+do\s+i\s+work|my\s+job)/iu.test(query))
    add("user.work");
  return keys;
}

export function rankMemories(
  query: string,
  memories: MemoryRecord[],
  now = Date.now(),
  limit = 8,
): MemoryRecord[] {
  const queryTokens = textTokens(query);
  const broadRecall = isBroadRecallQuery(query);
  return memories
    .filter((memory) => memory.status === "active")
    .map((memory) => {
      const semanticProxy = overlapScore(
        queryTokens,
        `${memory.summary} ${memory.topics.join(" ")}`,
      );
      const ageDays = Math.max(0, (now - memory.createdAt) / DAY);
      const accessedDays = Math.max(0, (now - memory.lastAccessedAt) / DAY);
      const recency = Math.exp(-ageDays / 45);
      const accessRecency = Math.exp(-accessedDays / 30);
      const score = broadRecall
        ? semanticProxy * 0.12 +
          memory.importance * 0.32 +
          memory.emotionalWeight * 0.13 +
          memory.retrievalStrength * 0.23 +
          recency * 0.1 +
          accessRecency * 0.1
        : semanticProxy * 0.62 +
          memory.importance * 0.14 +
          memory.emotionalWeight * 0.08 +
          memory.retrievalStrength * 0.09 +
          recency * 0.04 +
          accessRecency * 0.03;
      return { memory, score, semanticProxy };
    })
    .filter(({ score, semanticProxy }) =>
      broadRecall ? score >= 0.12 : semanticProxy >= 0.08 && score >= 0.13,
    )
    .sort((a, b) => b.score - a.score || b.memory.updatedAt - a.memory.updatedAt)
    .slice(0, limit)
    .map(({ memory }) => memory);
}

export function rankFacts(
  query: string,
  facts: KnowledgeFact[],
  now = Date.now(),
  limit = 6,
): KnowledgeFact[] {
  const queryTokens = textTokens(query);
  const broadRecall = isBroadRecallQuery(query);
  const explicitKeys = new Set(factKeysForQuery(query));
  const latest = new Map<string, KnowledgeFact>();
  for (const fact of facts) {
    const previous = latest.get(fact.key);
    if (
      fact.status === "active" &&
      (!previous || fact.lastConfirmedAt > previous.lastConfirmedAt)
    )
      latest.set(fact.key, fact);
  }
  return [...latest.values()]
    .map((fact) => {
      const semantic = overlapScore(
        queryTokens,
        `${fact.key} ${fact.statement} ${fact.value}`,
      );
      const exactKey = explicitKeys.has(fact.key) ? 1 : 0;
      const ageDays = Math.max(0, (now - fact.lastConfirmedAt) / DAY);
      const freshness = Math.exp(-ageDays / 180);
      const score = broadRecall
        ? exactKey * 0.45 + fact.confidence * 0.38 + freshness * 0.17
        : exactKey * 0.55 + semantic * 0.55 + fact.confidence * 0.15 + freshness * 0.05;
      return { fact, score, semantic, exactKey };
    })
    .filter(({ score, semantic, exactKey }) =>
      broadRecall
        ? score >= 0.22
        : exactKey > 0 || (semantic >= 0.08 && score >= 0.16),
    )
    .sort((a, b) => b.score - a.score || b.fact.lastConfirmedAt - a.fact.lastConfirmedAt)
    .slice(0, limit)
    .map(({ fact }) => fact);
}

export function rankOpenThreads(
  query: string,
  threads: OpenThread[],
  now = Date.now(),
  limit = 4,
): OpenThread[] {
  const queryTokens = textTokens(query);
  const broadRecall = isBroadRecallQuery(query);
  return threads
    .filter((thread) => thread.status === "open")
    .map((thread) => {
      const semantic = overlapScore(
        queryTokens,
        `${thread.topic} ${thread.summary}`,
      );
      const ageDays = Math.max(0, (now - thread.lastTouchedAt) / DAY);
      const recency = Math.exp(-ageDays / 21);
      const score = broadRecall
        ? thread.priority * 0.68 + recency * 0.32
        : semantic * 0.68 + thread.priority * 0.24 + recency * 0.08;
      return { thread, score, semantic };
    })
    .filter(({ score, semantic }) =>
      broadRecall ? score >= 0.2 : semantic >= 0.08 && score >= 0.18,
    )
    .sort((a, b) => b.score - a.score || b.thread.lastTouchedAt - a.thread.lastTouchedAt)
    .slice(0, limit)
    .map(({ thread }) => thread);
}
