/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { CharacterEvent } from "../events/event-types";
import type { CompanionRepository } from "../storage/repositories/interfaces";
import { decayMemory, type KnowledgeFact, type MemoryContext, type MemoryRecord, type OpenThread } from "./model";

// ---- memory-retrieval.ts ----
const DAY = 86_400_000;

const MEMORY_STOP_WORDS = new Set([
  "а", "и", "но", "да", "нет", "ну", "же", "ли", "бы", "в", "во", "на", "по", "к", "ко", "с", "со", "у", "о", "об", "от", "до", "за", "из", "для", "про",
  "это", "этот", "эта", "эти", "того", "тоже", "ещё", "еще", "там", "тут", "как", "что", "кто", "где", "когда", "почему", "зачем",
  "я", "ты", "он", "она", "мы", "вы", "они", "мне", "меня", "мой", "моя", "моё", "мои", "тебе", "тебя", "твой", "твоя",
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "at", "for", "about", "i", "me", "my", "you", "your", "we", "what", "where", "when", "why", "how",
]);

const MEMORY_CONCEPTS: ReadonlyArray<readonly [string, RegExp]> = [
  ["work", /(?:работ|карьер|професси|должност|смен[аыу]|устроил(?:ся|ась)?|уволил(?:ся|ась)?|офис|автосервис|мастерск|job|work|career|office)/iu],
  ["study", /(?:уч[её]б|учусь|учил(?:ся|ась)?|училищ|школ|колледж|универ|институт|образован|курс|study|school|college|university|course)/iu],
  ["residence", /(?:живу|жил(?:а)?|переех|город|квартир|дом[аеу]?|место\s+жительств|residen|where\s+i\s+live|moved|city|home)/iu],
  ["partner", /(?:девушк|парн(?:я|ем|ю)?|жен[аые]|муж|невест|жених|партн[её]р|отношени|girlfriend|boyfriend|wife|husband|partner|relationship)/iu],
  ["family", /(?:мам|пап|родител|брат|сестр|семь[яеи]|сын|доч|бабуш|дедуш|family|mother|father|brother|sister|son|daughter)/iu],
  ["pet", /(?:кот|кошк|собак|питом|щен|кот[её]нок|pet|cat|dog)/iu],
  ["car", /(?:машин|авто|тачк|bmw|бмв|mercedes|мерседес|audi|ауди|car|vehicle)/iu],
  ["trading", /(?:трейд|крипт|рынок|бирж|сделк|позици|фьючерс|bybit|атас|trading|crypto|market|exchange)/iu],
  ["plan", /(?:план|цель|мечт|собираюсь|хочу\s+(?:переех|стать|сделать|купить|начать)|завтра|потом|plan|goal|dream)/iu],
  ["preference", /(?:люблю|нравит|не\s+люблю|не\s+нравит|предпочита|любим|favorite|favourite|prefer|like|dislike)/iu],
];

function normalizeToken(token: string) {
  let value = token.toLowerCase().replace(/ё/gu, "е");
  if (/^[а-я]+$/u.test(value) && value.length > 4) {
    value = value.replace(
      /(иями|ями|ами|ого|ему|ому|ыми|ими|ах|ях|ов|ев|ей|ам|ям|ом|ем|ой|ый|ий|ая|яя|ое|ее|ые|ие|ы|и|а|я|у|ю|е|о)$/u,
      "",
    );
  }
  return value;
}

function rawMemoryTerms(text: string) {
  return text
    .toLowerCase()
    .replace(/ё/gu, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizeToken)
    .filter((token) => token.length > 1 && !MEMORY_STOP_WORDS.has(token));
}

export function memoryConceptTerms(text: string) {
  return MEMORY_CONCEPTS
    .filter(([, pattern]) => pattern.test(text))
    .map(([concept]) => `concept:${concept}`);
}

/** Stable terms persisted on memories and reused for query-side lookup. */
export function memoryTopicTerms(text: string, limit = 12) {
  const concepts = memoryConceptTerms(text);
  const raw = rawMemoryTerms(text).filter((token) => token.length > 3);
  return [...new Set([...concepts, ...raw])].slice(0, limit);
}

export const textTokens = (text: string) =>
  new Set([...rawMemoryTerms(text), ...memoryConceptTerms(text)]);

/** Firestore array-contains-any supports at most ten values. Keep generic four-letter
 * chat words out of the indexed deep-read path unless they map to a concept. */
export const topicQueryTerms = (text: string) => [
  ...new Set([
    ...memoryConceptTerms(text),
    ...rawMemoryTerms(text).filter((token) => token.length > 4),
  ]),
].slice(0, 10);

function overlapScore(query: Set<string>, text: string) {
  if (!query.size) return 0;
  const candidate = textTokens(text);
  if (!candidate.size) return 0;
  const overlap = [...query].filter((token) => candidate.has(token)).length;
  return overlap / Math.max(1, Math.min(query.size, candidate.size));
}

export function isBroadRecallQuery(query: string) {
  const normalized = query
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return /^(?:(?:а|ну)\s+)?(?:что\s+ты\s+(?:вообще\s+)?помнишь(?:\s+обо\s+мне)?|что\s+ты\s+(?:вообще\s+)?знаешь\s+обо\s+мне|расскажи\s+что\s+ты\s+помнишь(?:\s+обо\s+мне)?|ты\s+(?:вообще\s+)?помнишь(?:\s+меня|\s+обо\s+мне)?|помнишь|what\s+do\s+you\s+remember(?:\s+about\s+me)?|do\s+you\s+remember\s+me)$/iu.test(normalized);
}

export function isMemoryRecallQuery(query: string) {
  return /(?:помнишь|помнишь\s+ли|что\s+ты\s+помнишь|напомни|мы\s+(?:обсуждали|говорили)|что\s+я\s+(?:тебе\s+)?(?:говорил|говорила|рассказывал|рассказывала)|раньше\s+(?:говорил|говорила|рассказывал|рассказывала)|remember|what\s+do\s+you\s+remember|remind|talked\s+about)/iu.test(query);
}

function isUserMemoryRecallQuery(query: string) {
  return /(?:обо\s+мне|про\s+меня|что\s+я\s+(?:тебе\s+)?(?:говорил|говорила|рассказывал|рассказывала)|где\s+я|кем\s+я|как\s+меня|сколько\s+мне|мой|моя|мое|моё|мои|my\s+(?:name|age|job)|about\s+me|what\s+i\s+(?:said|told))/iu.test(query) || isBroadRecallQuery(query);
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
  if (/(где\s+я\s+работаю|кем\s+я\s+работаю|моя\s+работа|куда\s+я\s+устроил(?:ся|ась)|where\s+do\s+i\s+work|my\s+job)/iu.test(query))
    add("user.work");
  if (/(где\s+я\s+учусь|на\s+кого\s+я\s+учусь|чему\s+я\s+учусь|моя\s+уч[её]ба|where\s+do\s+i\s+study|what\s+do\s+i\s+study)/iu.test(query))
    add("user.study");
  if (/(как\s+зовут\s+(?:мою\s+)?(?:девушку|жену)|как\s+зовут\s+(?:моего\s+)?(?:парня|мужа)|имя\s+(?:моей\s+)?(?:девушки|жены)|имя\s+(?:моего\s+)?(?:парня|мужа)|partner(?:'s)?\s+name)/iu.test(query))
    add("user.partner.name");
  if (/(как\s+зовут\s+(?:моего|мою)\s+(?:кота|кошку|собаку)|имя\s+(?:моего|моей)\s+(?:кота|кошки|собаки)|pet(?:'s)?\s+name)/iu.test(query))
    add("user.pet.name");
  if (/(какая\s+у\s+меня\s+(?:машина|тачка|авто)|на\s+ч[её]м\s+я\s+езжу|моя\s+(?:машина|тачка)|my\s+car)/iu.test(query))
    add("user.vehicle");
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
  const userRecall = isUserMemoryRecallQuery(query);
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
      const sourceBias = userRecall
        ? memory.summary.startsWith("Пользователь:")
          ? 0.18
          : memory.summary.startsWith("Она:")
            ? -0.1
            : 0
        : 0;
      const score = (broadRecall
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
          accessRecency * 0.03) + sourceBias;
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
  const userRecall = isUserMemoryRecallQuery(query);
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
      const subjectBias = userRecall
        ? fact.subject === "user"
          ? 0.18
          : -0.08
        : 0;
      const score = (broadRecall
        ? exactKey * 0.45 + fact.confidence * 0.38 + freshness * 0.17
        : exactKey * 0.55 + semantic * 0.55 + fact.confidence * 0.15 + freshness * 0.05) + subjectBias;
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

// ---- memory-context.ts ----
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

// ---- open-threads.ts ----
const deferralPattern =
  /(потом\s+(?:расскажу|объясню|поговорим)|поговорим\s+(?:об\s+этом\s+)?потом|верн[её]мся\s+к\s+этому|не\s+сейчас|напомни\s+(?:мне\s+)?потом)/iu;
const resolutionCue =
  /(кстати|насч[её]т|по\s+поводу|возвращаясь|помнишь|рассказываю|теперь\s+могу\s+рассказать)/iu;

export function threadCandidateFromEvent(
  event: CharacterEvent,
): OpenThread | null {
  if (event.type !== "message" || event.source !== "user") return null;
  const text = String((event.payload as { text?: string })?.text ?? "").trim();
  if (!text || !deferralPattern.test(text)) return null;
  const now = event.timestamp;
  return {
    id: `thread_${event.id}`,
    topic:
      text.replace(deferralPattern, "").trim().slice(0, 90) ||
      "Незаконченная тема",
    summary: `Пользователь отложил тему: ${text.slice(0, 220)}`,
    priority: /важн|серь[её]з|обязательно|напомни/iu.test(text) ? 0.82 : 0.58,
    sourceEventIds: [event.id],
    createdAt: now,
    updatedAt: now,
    lastTouchedAt: now,
    status: "open",
  };
}

function similarity(a: string, b: string) {
  const aTokens = textTokens(a);
  const bTokens = textTokens(b);
  if (!aTokens.size || !bTokens.size) return 0;
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap / Math.max(1, Math.min(aTokens.size, bTokens.size));
}

export function resolveThreadsFromEvent(
  event: CharacterEvent,
  threads: OpenThread[],
): OpenThread[] {
  if (event.type !== "message" || event.source !== "user") return [];
  const text = String((event.payload as { text?: string })?.text ?? "").trim();
  if (!text || deferralPattern.test(text) || !resolutionCue.test(text))
    return [];
  const now = event.timestamp;

  return threads
    .filter((thread) => {
      if (thread.status !== "open" || event.timestamp < thread.createdAt)
        return false;
      const topicScore = similarity(text, thread.topic);
      const summaryScore = similarity(text, thread.summary);
      return topicScore >= 0.12 || summaryScore >= 0.12;
    })
    .map((thread) => ({
      ...thread,
      status: "resolved" as const,
      resolvedAt: now,
      updatedAt: now,
      lastTouchedAt: now,
      sourceEventIds: [...new Set([...thread.sourceEventIds, event.id])],
    }));
}
