import type { CharacterEvent } from '../events/event-types';
import type { CompanionRepository } from '../storage/repositories/interfaces';
import type { KnowledgeFact, MemoryConsolidationReport, MemoryRecord } from './memory-types';
import { decayMemory } from './memory-decay';
import { extractSemanticCandidates, factFromCandidate } from './semantic-extraction';
import { resolveThreadsFromEvent, threadCandidateFromEvent } from './open-threads';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function eventText(event: CharacterEvent) {
  return String((event.payload as { text?: string })?.text ?? '').trim();
}

function topicsFrom(text: string) {
  return [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 4))].slice(0, 8);
}

function emotionalWeight(text: string) {
  const strong = /(люблю|ненавижу|боюсь|страшно|бесит|счаст|груст|обид|скуч|важно|обещ|никогда|всегда|love|hate|afraid|promise)/iu.test(text);
  return strong ? 0.72 : 0.24;
}

function inferredImportance(event: CharacterEvent, text: string) {
  let score = event.importance;
  if (text.length > 160) score += 0.08;
  if (/(запомни|важно|никогда|всегда|обещ|люблю|ненавижу|родил|умер|переех|увол|женил|расстал|remember|important|promise)/iu.test(text)) score += 0.28;
  if (/(меня зовут|мне \d{1,3} (?:лет|года?|год)|я живу|я работаю|я люблю|я не люблю|мне нравится|мне не нравится)/iu.test(text)) score += 0.14;
  return clamp(score);
}

function memoryFromEvent(event: CharacterEvent, existingKind?: MemoryRecord['kind']): MemoryRecord | null {
  const worldSummary = event.type === 'world' ? String((event.payload as { summary?: string })?.summary ?? '').trim() : '';
  const text = event.type === 'message' ? eventText(event) : worldSummary;
  if (!text || text.length < 3) return null;
  if (event.type !== 'message' && event.type !== 'world') return null;
  if (event.source === 'character' && event.importance < 0.55) return null;
  if (event.type === 'world' && event.importance < 0.45) return null;
  const now = event.timestamp;
  const importance = event.type === 'world' ? clamp(event.importance) : inferredImportance(event, text);
  const emotional = event.type === 'world' ? clamp(event.importance * 0.75) : emotionalWeight(text);
  const kind: MemoryRecord['kind'] = existingKind ?? (importance >= 0.61 || emotional >= 0.65 ? 'episodic' : 'short_term');
  const who = event.type === 'world' ? 'Она' : event.source === 'user' ? 'Пользователь' : event.source === 'character' ? 'Она' : 'Система';

  return {
    id: `memory_${event.id}`,
    kind,
    summary: `${who}: ${text.slice(0, kind === 'episodic' ? 320 : 220)}`,
    sourceEventIds: [event.id],
    topics: topicsFrom(text),
    importance,
    confidence: 1,
    emotionalWeight: emotional,
    retrievalStrength: kind === 'episodic' ? 0.82 : 0.58,
    accessCount: 0,
    createdAt: event.timestamp,
    updatedAt: now,
    lastAccessedAt: now,
    validFrom: event.timestamp,
    status: 'active',
  };
}

async function mergeFact(repository: CompanionRepository, candidate: KnowledgeFact, report: MemoryConsolidationReport) {
  const facts = await repository.listKnowledgeFacts();
  const sameKey = facts.filter((fact) => fact.key === candidate.key && fact.status === 'active');
  const exact = sameKey.find((fact) => fact.value.toLowerCase() === candidate.value.toLowerCase());

  if (exact) {
    const isNewEvidence = candidate.sourceEventIds.some((eventId) => !exact.sourceEventIds.includes(eventId));
    if (!isNewEvidence) return exact;
    const updated: KnowledgeFact = {
      ...exact,
      confidence: clamp(exact.confidence + (1 - exact.confidence) * 0.18),
      evidenceCount: exact.evidenceCount + 1,
      sourceEventIds: [...new Set([...exact.sourceEventIds, ...candidate.sourceEventIds])],
      updatedAt: candidate.updatedAt,
      lastConfirmedAt: candidate.lastConfirmedAt,
    };
    await repository.saveKnowledgeFact(updated);
    report.factsConfirmed.push(updated.id);
    return updated;
  }

  for (const previous of sameKey) {
    const outdated: KnowledgeFact = {
      ...previous,
      status: 'outdated',
      validUntil: candidate.validFrom,
      updatedAt: candidate.updatedAt,
      supersededByFactId: candidate.id,
    };
    await repository.saveKnowledgeFact(outdated);
    report.factsOutdated.push(outdated.id);
  }

  await repository.saveKnowledgeFact(candidate);
  report.factsCreated.push(candidate.id);
  return candidate;
}

export async function decayStoredMemories(repository: CompanionRepository, now = Date.now(), report?: MemoryConsolidationReport) {
  const memories = await repository.listMemories();
  for (const memory of memories) {
    const decayed = decayMemory(memory, now);
    const changed = decayed.retrievalStrength !== memory.retrievalStrength || decayed.status !== memory.status;
    if (!changed) continue;
    await repository.saveMemory(decayed);
    if (memory.status !== 'archived' && decayed.status === 'archived') report?.memoriesArchived.push(memory.id);
  }
}


async function enforceShortTermCap(repository: CompanionRepository, cap = 80, report?: MemoryConsolidationReport) {
  const active = (await repository.listMemories({ limit: 600 }))
    .filter((memory) => memory.status === 'active' && memory.kind === 'short_term');
  if (active.length <= cap) return;

  const candidates = [...active]
    .sort((a, b) => {
      const aKeep = a.importance * 0.55 + a.emotionalWeight * 0.25 + a.retrievalStrength * 0.2;
      const bKeep = b.importance * 0.55 + b.emotionalWeight * 0.25 + b.retrievalStrength * 0.2;
      return aKeep - bKeep || a.createdAt - b.createdAt;
    })
    .slice(0, active.length - cap);

  const now = Date.now();
  for (const memory of candidates) {
    await repository.saveMemory({ ...memory, status: 'archived', updatedAt: now });
    report?.memoriesArchived.push(memory.id);
  }
}

export async function consolidateEvents(events: CharacterEvent[], repository: CompanionRepository): Promise<MemoryConsolidationReport> {
  const report: MemoryConsolidationReport = {
    processedEventIds: [],
    memoriesCreated: [],
    factsCreated: [],
    factsConfirmed: [],
    factsOutdated: [],
    threadsCreated: [],
    threadsResolved: [],
    memoriesArchived: [],
  };

  for (const event of events) {
    if (await repository.isEventConsolidated(event.id)) continue;

    const memory = memoryFromEvent(event);
    if (memory) {
      await repository.saveMemory(memory);
      report.memoriesCreated.push(memory.id);
    }

    if (event.type === 'message' && event.source === 'user') {
      const text = eventText(event);
      for (const extracted of extractSemanticCandidates(text)) {
        const fact = factFromCandidate(extracted, event, event.timestamp);
        const stored = await mergeFact(repository, fact, report);
        if (memory && stored && !stored.sourceMemoryIds.includes(memory.id)) {
          await repository.saveKnowledgeFact({
            ...stored,
            sourceMemoryIds: [...stored.sourceMemoryIds, memory.id],
          });
        }
      }

      const currentThreads = await repository.listOpenThreads();
      const resolved = resolveThreadsFromEvent(event, currentThreads);
      for (const thread of resolved) {
        await repository.saveOpenThread(thread);
        report.threadsResolved.push(thread.id);
      }

      const thread = threadCandidateFromEvent(event);
      if (thread) {
        await repository.saveOpenThread(thread);
        report.threadsCreated.push(thread.id);
      }
    }

    await repository.markEventConsolidated(event.id, event.timestamp);
    report.processedEventIds.push(event.id);
  }

  await decayStoredMemories(repository, Date.now(), report);
  await enforceShortTermCap(repository, 80, report);
  return report;
}

export async function recoverRecentMemory(repository: CompanionRepository, maxEvents = 120) {
  const events = await repository.listRecentEvents(maxEvents);
  return consolidateEvents(events, repository);
}
