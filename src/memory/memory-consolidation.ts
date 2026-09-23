import type { CharacterEvent } from "../events/event-types";
import type { CompanionRepository } from "../storage/repositories/interfaces";
import { MEMORY_PROCESSOR_VERSION } from "../storage/persistence-schema";
import type {
  KnowledgeFact,
  MemoryConsolidationReport,
  MemoryRecord,
} from "./model";
import { decayMemory } from "./model";
import {
  extractSemanticCandidates,
  factFromCandidate,
} from "./semantic-extraction";
import {
  resolveThreadsFromEvent,
  threadCandidateFromEvent,
} from "./retrieval";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function eventText(event: CharacterEvent) {
  return String((event.payload as { text?: string })?.text ?? "").trim();
}

function topicsFrom(text: string) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((x) => x.length > 4),
    ),
  ].slice(0, 8);
}


function splitMemorySentences(text: string) {
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function compactMemoryText(text: string, maxLength: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;

  const sentences = splitMemorySentences(text);
  if (sentences.length <= 1) {
    const head = clean.slice(0, Math.max(80, Math.floor(maxLength * 0.62))).trim();
    const tail = clean.slice(-Math.max(60, Math.floor(maxLength * 0.28))).trim();
    return `${head} … ${tail}`.slice(0, maxLength);
  }

  const scored = sentences.map((sentence, index) => {
    let score = 0;
    if (index === 0) score += 5;
    if (index === sentences.length - 1) score += 5;
    if (/(запомни|важно|никогда|всегда|обещ|люблю|ненавижу|живу|работаю|зовут|нравится|не нравится|remember|important|promise|live|work|name)/iu.test(sentence)) score += 4;
    if (/\d/u.test(sentence)) score += 1.5;
    if (/(я|мне|мой|моя|моё|мои|we|i|my)\b/iu.test(sentence)) score += 1;
    score += Math.min(2, sentence.length / 140);
    return { sentence, index, score };
  });

  const selected = new Set<number>([0, sentences.length - 1]);
  for (const item of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    selected.add(item.index);
    const joined = sentences
      .filter((_, index) => selected.has(index))
      .join(" ");
    if (joined.length > maxLength * 1.35) {
      selected.delete(item.index);
      break;
    }
  }

  let result = sentences
    .filter((_, index) => selected.has(index))
    .join(" ")
    .trim();
  if (result.length <= maxLength) return result;

  const first = sentences[0];
  const last = sentences[sentences.length - 1];
  const remaining = Math.max(20, maxLength - last.length - 3);
  result = `${first.slice(0, remaining).trim()} … ${last}`;
  return result.length <= maxLength ? result : result.slice(0, maxLength);
}

function emotionalWeight(text: string) {
  const strong =
    /(люблю|ненавижу|боюсь|страшно|бесит|счаст|груст|обид|скуч|важно|обещ|никогда|всегда|love|hate|afraid|promise)/iu.test(
      text,
    );
  return strong ? 0.72 : 0.24;
}

function inferredImportance(event: CharacterEvent, text: string) {
  let score = event.importance;
  if (text.length > 160) score += 0.08;
  if (
    /(запомни|важно|никогда|всегда|обещ|люблю|ненавижу|родил|умер|переех|увол|женил|расстал|remember|important|promise)/iu.test(
      text,
    )
  )
    score += 0.28;
  if (
    /(меня зовут|мне \d{1,3} (?:лет|года?|год)|я живу|я работаю|я люблю|я не люблю|мне нравится|мне не нравится)/iu.test(
      text,
    )
  )
    score += 0.14;
  return clamp(score);
}

function memoryFromEvent(
  event: CharacterEvent,
  existingKind?: MemoryRecord["kind"],
): MemoryRecord | null {
  const worldSummary =
    event.type === "world"
      ? String((event.payload as { summary?: string })?.summary ?? "").trim()
      : "";
  const text =
    event.type === "message" || event.type === "character_action"
      ? eventText(event)
      : worldSummary;
  if (!text || text.length < 3) return null;
  if (
    event.type !== "message" &&
    event.type !== "character_action" &&
    event.type !== "world"
  )
    return null;
  if (event.type === "character_action" && event.source !== "character") return null;
  if (event.type === "world" && event.importance < 0.45) return null;
  const now = event.timestamp;
  const importance =
    event.type === "world"
      ? clamp(event.importance)
      : inferredImportance(event, text);
  const emotional =
    event.type === "world"
      ? clamp(event.importance * 0.75)
      : emotionalWeight(text);
  const kind: MemoryRecord["kind"] =
    existingKind ??
    (importance >= 0.61 || emotional >= 0.65 ? "episodic" : "short_term");
  const who =
    event.type === "world"
      ? "Она"
      : event.source === "user"
        ? "Пользователь"
        : event.source === "character"
          ? "Она"
          : "Система";

  return {
    id: `memory_${event.id}`,
    kind,
    summary: `${who}: ${compactMemoryText(
      text,
      kind === "episodic" ? 480 : 320,
    )}`,
    sourceEventIds: [event.id],
    topics: topicsFrom(text),
    importance,
    confidence: 1,
    emotionalWeight: emotional,
    retrievalStrength: kind === "episodic" ? 0.82 : 0.58,
    accessCount: 0,
    createdAt: event.timestamp,
    updatedAt: now,
    lastAccessedAt: now,
    validFrom: event.timestamp,
    status: "active",
  };
}

async function getMemory(
  repository: CompanionRepository,
  id: string,
) {
  return repository.getMemory(id);
}

async function markMemoryOutdated(
  repository: CompanionRepository,
  memoryId: string,
  contradictionGroup: string,
  validUntil: number,
  report: MemoryConsolidationReport,
) {
  const memory = await getMemory(repository, memoryId);
  if (!memory || memory.status !== "active") return;
  await repository.saveMemory({
    ...memory,
    status: "outdated",
    validUntil,
    contradictionGroup,
    updatedAt: Math.max(memory.updatedAt, validUntil),
  });
  if (!report.memoriesOutdated.includes(memory.id))
    report.memoriesOutdated.push(memory.id);
}

async function linkSupersedingMemory(
  repository: CompanionRepository,
  memory: MemoryRecord | null,
  contradictionGroup: string,
  supersedesMemoryId?: string,
) {
  if (!memory) return;
  const stored = (await repository.getMemory(memory.id)) ?? memory;
  await repository.saveMemory({
    ...stored,
    contradictionGroup,
    supersedesMemoryId: supersedesMemoryId ?? stored.supersedesMemoryId,
  });
}

function sameFactValue(a: KnowledgeFact, b: KnowledgeFact) {
  return a.value.trim().toLowerCase() === b.value.trim().toLowerCase();
}

function stripFactFromUserText(text: string, fact: KnowledgeFact) {
  const parts = text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  let removed = false;
  const kept = parts.filter((part) => {
    const candidates = extractSemanticCandidates(part);
    const matches = candidates.some(
      (candidate) =>
        candidate.key === fact.key &&
        candidate.value.trim().toLowerCase() === fact.value.trim().toLowerCase(),
    );
    if (matches) removed = true;
    return !matches;
  });
  return { text: kept.join(" ").trim(), removed };
}

async function retireFactFromMemory(
  repository: CompanionRepository,
  memoryId: string,
  fact: KnowledgeFact,
  validUntil: number,
  report: MemoryConsolidationReport,
) {
  const memory = await repository.getMemory(memoryId);
  if (!memory || memory.status !== "active") return false;

  const sourceEvents = (
    await Promise.all(memory.sourceEventIds.map((id) => repository.getEvent(id)))
  ).filter((event): event is CharacterEvent => event !== null);

  let removed = false;
  const remaining: string[] = [];
  if (sourceEvents.length) {
    for (const event of sourceEvents) {
      if (event.type === "message" && event.source === "user") {
        const stripped = stripFactFromUserText(eventText(event), fact);
        removed ||= stripped.removed;
        if (stripped.text) remaining.push(stripped.text);
        continue;
      }
      const text =
        event.type === "world"
          ? String((event.payload as { summary?: string })?.summary ?? "").trim()
          : eventText(event);
      if (text) remaining.push(text);
    }
  } else {
    // Direct consolidation tests and legacy stores may not retain the raw event.
    // The memory summary is still sufficient to remove a sentence-level fact
    // without discarding unrelated details from the same memory.
    const summaryBody = memory.summary.replace(/^(?:Пользователь|Она|Система):\s*/u, "");
    const stripped = stripFactFromUserText(summaryBody, fact);
    removed = stripped.removed;
    if (stripped.text) remaining.push(stripped.text);
  }

  // If the source cannot be reconstructed safely, preserve the old behavior:
  // a memory containing only the superseded fact must not stay searchable.
  if (!removed || !remaining.length) {
    await markMemoryOutdated(
      repository,
      memory.id,
      fact.key,
      validUntil,
      report,
    );
    return true;
  }

  const combined = remaining.join(" ").trim();
  const who = sourceEvents[0]?.source === "character"
    ? "Она"
    : memory.summary.startsWith("Она:")
      ? "Она"
      : "Пользователь";
  const maxLength = memory.kind === "episodic" ? 480 : 320;
  await repository.saveMemory({
    ...memory,
    summary: `${who}: ${compactMemoryText(combined, maxLength)}`,
    topics: topicsFrom(combined),
    updatedAt: Math.max(memory.updatedAt, validUntil),
  });
  return false;
}

async function mergeFact(
  repository: CompanionRepository,
  candidate: KnowledgeFact,
  report: MemoryConsolidationReport,
  sourceMemory: MemoryRecord | null,
) {
  const candidateWithMemory: KnowledgeFact = sourceMemory
    ? {
        ...candidate,
        sourceMemoryIds: [
          ...new Set([...candidate.sourceMemoryIds, sourceMemory.id]),
        ],
      }
    : candidate;

  const result = await repository.mergeKnowledgeFact(candidateWithMemory);
  if (result.outcome === "confirmed") {
    if (!report.factsConfirmed.includes(result.activeFact.id))
      report.factsConfirmed.push(result.activeFact.id);
  } else {
    if (!report.factsCreated.includes(result.candidateFact.id))
      report.factsCreated.push(result.candidateFact.id);
  }

  // A fact transaction may have committed before a later memory write failed.
  // Re-read historical facts linked to the active winner so a retry can finish
  // retiring/scrubbing their source memories without changing the fact again.
  const historical = await repository.listKnowledgeFacts({
    key: candidate.key,
    statuses: ["outdated"],
    limit: 40,
  });
  const supersededFacts = [
    ...new Map(
      [...result.supersededFacts, ...historical.filter((fact) => fact.supersededByFactId === result.activeFact.id)]
        .map((fact) => [fact.id, fact]),
    ).values(),
  ];

  const fullyRetiredMemoryIds: string[] = [];
  for (const previous of supersededFacts) {
    if (!report.factsOutdated.includes(previous.id))
      report.factsOutdated.push(previous.id);
    const previousMemoryIds = previous.sourceMemoryIds.length
      ? previous.sourceMemoryIds
      : previous.sourceEventIds.map((eventId) => `memory_${eventId}`);
    for (const memoryId of previousMemoryIds) {
      const fullyRetired = await retireFactFromMemory(
        repository,
        memoryId,
        previous,
        result.activeFact.validFrom,
        report,
      );
      if (fullyRetired) fullyRetiredMemoryIds.push(memoryId);
    }
  }

  if (result.outcome === "historical" && sourceMemory) {
    const fullyRetired = await retireFactFromMemory(
      repository,
      sourceMemory.id,
      result.candidateFact,
      result.activeFact.validFrom,
      report,
    );
    if (fullyRetired) fullyRetiredMemoryIds.push(sourceMemory.id);
  }

  if (fullyRetiredMemoryIds.length) {
    const activeMemoryId =
      result.activeFact.sourceMemoryIds[0] ??
      (result.activeFact.sourceEventIds[0]
        ? `memory_${result.activeFact.sourceEventIds[0]}`
        : undefined);
    if (activeMemoryId) {
      const activeMemory = await repository.getMemory(activeMemoryId);
      const previousMemories = (
        await Promise.all(
          fullyRetiredMemoryIds.map((id) => repository.getMemory(id)),
        )
      ).filter((memory): memory is MemoryRecord => memory !== null);
      previousMemories.sort(
        (a, b) =>
          (b.validFrom ?? b.createdAt) - (a.validFrom ?? a.createdAt) ||
          b.createdAt - a.createdAt,
      );
      await linkSupersedingMemory(
        repository,
        activeMemory,
        candidate.key,
        previousMemories[0]?.id,
      );
    }
  }

  // Defensive invariant: callers should only ever observe one active fact for
  // an exclusive logical key, even when this merge repaired legacy duplicates.
  if (
    result.outcome !== "historical" &&
    !sameFactValue(result.activeFact, candidateWithMemory)
  ) {
    throw new Error(`knowledge-merge-invariant:${candidate.key}`);
  }
  return result.activeFact;
}

export async function decayStoredMemories(
  repository: CompanionRepository,
  now = Date.now(),
  report?: MemoryConsolidationReport,
) {
  const memories = await repository.listMemories();
  for (const memory of memories) {
    const decayed = decayMemory(memory, now);
    const changed =
      decayed.retrievalStrength !== memory.retrievalStrength ||
      decayed.status !== memory.status;
    if (!changed) continue;
    await repository.saveMemory(decayed);
    if (memory.status !== "archived" && decayed.status === "archived")
      report?.memoriesArchived.push(memory.id);
  }
}

async function enforceShortTermCap(
  repository: CompanionRepository,
  cap = 80,
  report?: MemoryConsolidationReport,
) {
  const [recent, oldest] = await Promise.all([
    repository.listMemories({
      limit: 800,
      sortBy: "updatedAt",
      direction: "desc",
      statuses: ["active"],
      kinds: ["short_term"],
    }),
    repository.listMemories({
      limit: 400,
      sortBy: "createdAt",
      direction: "asc",
      statuses: ["active"],
      kinds: ["short_term"],
    }),
  ]);
  const active = [
    ...new Map([...recent, ...oldest].map((memory) => [memory.id, memory])).values(),
  ];
  if (active.length <= cap) return;

  const candidates = [...active]
    .sort((a, b) => {
      const aKeep =
        a.importance * 0.55 +
        a.emotionalWeight * 0.25 +
        a.retrievalStrength * 0.2;
      const bKeep =
        b.importance * 0.55 +
        b.emotionalWeight * 0.25 +
        b.retrievalStrength * 0.2;
      return aKeep - bKeep || a.createdAt - b.createdAt;
    })
    .slice(0, active.length - cap);

  const now = Date.now();
  for (const memory of candidates) {
    await repository.saveMemory({
      ...memory,
      status: "archived",
      updatedAt: now,
    });
    report?.memoriesArchived.push(memory.id);
  }
}

export async function consolidateEvents(
  events: CharacterEvent[],
  repository: CompanionRepository,
  knownProcessed?: Set<string>,
): Promise<MemoryConsolidationReport> {
  const report: MemoryConsolidationReport = {
    processedEventIds: [],
    memoriesCreated: [],
    factsCreated: [],
    factsConfirmed: [],
    factsOutdated: [],
    threadsCreated: [],
    threadsResolved: [],
    memoriesArchived: [],
    memoriesOutdated: [],
  };

  for (const event of [...events].sort(
    (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
  )) {
    if (
      knownProcessed
        ? knownProcessed.has(event.id)
        : await repository.isEventConsolidated(event.id)
    )
      continue;

    const generatedMemory = memoryFromEvent(event);
    let memory: MemoryRecord | null = null;
    if (generatedMemory) {
      const existingMemory = await repository.getMemory(generatedMemory.id);
      const storedMemory: MemoryRecord = existingMemory
        ? {
            ...generatedMemory,
            kind: existingMemory.kind,
            retrievalStrength: existingMemory.retrievalStrength,
            accessCount: existingMemory.accessCount,
            createdAt: existingMemory.createdAt,
            lastAccessedAt: existingMemory.lastAccessedAt,
            status: existingMemory.status,
            validUntil: existingMemory.validUntil,
            supersedesMemoryId: existingMemory.supersedesMemoryId,
            contradictionGroup: existingMemory.contradictionGroup,
          }
        : generatedMemory;
      await repository.saveMemory(storedMemory);
      if (!existingMemory) report.memoriesCreated.push(storedMemory.id);
      memory = storedMemory;
    }

    if (event.type === "message" && event.source === "user") {
      const text = eventText(event);
      for (const extracted of extractSemanticCandidates(text)) {
        const fact = factFromCandidate(extracted, event, event.timestamp);
        await mergeFact(repository, fact, report, memory);
      }

      const currentThreads = await repository.listOpenThreads({
        statuses: ["open"],
        limit: 160,
      });
      const resolved = resolveThreadsFromEvent(event, currentThreads);
      for (const thread of resolved) {
        await repository.saveOpenThread(thread);
        report.threadsResolved.push(thread.id);
      }

      const thread = threadCandidateFromEvent(event);
      if (thread && !currentThreads.some((t) => t.id === thread.id)) {
        await repository.saveOpenThread(thread);
        report.threadsCreated.push(thread.id);
      }
    }

    await repository.markEventConsolidated(event.id, event.timestamp);
    report.processedEventIds.push(event.id);
  }

  await enforceShortTermCap(repository, 80, report);
  return report;
}

function mergeReports(
  target: MemoryConsolidationReport,
  source: MemoryConsolidationReport,
) {
  for (const key of Object.keys(target) as Array<keyof MemoryConsolidationReport>) {
    target[key].push(...source[key]);
  }
}

function emptyReport(): MemoryConsolidationReport {
  return {
    processedEventIds: [],
    memoriesCreated: [],
    factsCreated: [],
    factsConfirmed: [],
    factsOutdated: [],
    threadsCreated: [],
    threadsResolved: [],
    memoriesArchived: [],
    memoriesOutdated: [],
  };
}

/**
 * Incremental memory recovery.
 * New writes are handled through memoryPending. Historical data is backfilled
 * page-by-page with a persisted cursor, so startup never depends on a fixed
 * "last N events" window and never needs to rescan the whole history forever.
 */
export async function recoverMemory(
  repository: CompanionRepository,
  pageSize = 120,
) {
  const report = emptyReport();

  const pending = await repository.listPendingMemoryEvents(pageSize);
  if (pending.length) mergeReports(report, await consolidateEvents(pending, repository));

  const storedRecovery = await repository.loadMemoryRecoveryState();
  const recovery =
    storedRecovery?.processorVersion === MEMORY_PROCESSOR_VERSION
      ? storedRecovery
      : {
          processorVersion: MEMORY_PROCESSOR_VERSION,
          cursor: null,
          backfillComplete: false,
          updatedAt: Date.now(),
        };

  const page = await repository.listEventsForMemoryBackfill({
    after: recovery.cursor,
    limit: pageSize,
  });
  if (page.length) {
    mergeReports(report, await consolidateEvents(page, repository));
    const last = page[page.length - 1];
    recovery.cursor = { timestamp: last.timestamp, id: last.id };
  }
  recovery.backfillComplete = page.length < pageSize;
  recovery.updatedAt = Date.now();
  await repository.saveMemoryRecoveryState(recovery);

  return report;
}

// Compatibility name retained for runtime imports from older modules.
export const recoverRecentMemory = recoverMemory;
