import type { CharacterEvent } from '../events/event-types';
import type { OpenThread } from './memory-types';
import { textTokens } from './memory-retrieval';

const deferralPattern = /(потом\s+(?:расскажу|объясню|поговорим)|поговорим\s+(?:об\s+этом\s+)?потом|верн[её]мся\s+к\s+этому|не\s+сейчас|напомни\s+(?:мне\s+)?потом)/iu;
const resolutionCue = /(кстати|насч[её]т|по\s+поводу|возвращаясь|помнишь|рассказываю|теперь\s+могу\s+рассказать)/iu;

export function threadCandidateFromEvent(event: CharacterEvent): OpenThread | null {
  if (event.type !== 'message' || event.source !== 'user') return null;
  const text = String((event.payload as { text?: string })?.text ?? '').trim();
  if (!text || !deferralPattern.test(text)) return null;
  const now = event.timestamp;
  return {
    id: `thread_${event.id}`,
    topic: text.replace(deferralPattern, '').trim().slice(0, 90) || 'Незаконченная тема',
    summary: `Пользователь отложил тему: ${text.slice(0, 220)}`,
    priority: /важн|серь[её]з|обязательно|напомни/iu.test(text) ? 0.82 : 0.58,
    sourceEventIds: [event.id],
    createdAt: now,
    updatedAt: now,
    lastTouchedAt: now,
    status: 'open',
  };
}

function similarity(a: string, b: string) {
  const aTokens = textTokens(a);
  const bTokens = textTokens(b);
  if (!aTokens.size || !bTokens.size) return 0;
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap / Math.max(1, Math.min(aTokens.size, bTokens.size));
}

export function resolveThreadsFromEvent(event: CharacterEvent, threads: OpenThread[]): OpenThread[] {
  if (event.type !== 'message' || event.source !== 'user') return [];
  const text = String((event.payload as { text?: string })?.text ?? '').trim();
  if (!text || deferralPattern.test(text) || !resolutionCue.test(text)) return [];
  const now = event.timestamp;

  return threads
    .filter((thread) => {
      if (thread.status !== 'open') return false;
      const topicScore = similarity(text, thread.topic);
      const summaryScore = similarity(text, thread.summary);
      return topicScore >= 0.12 || summaryScore >= 0.12;
    })
    .map((thread) => ({
      ...thread,
      status: 'resolved' as const,
      resolvedAt: now,
      updatedAt: now,
      lastTouchedAt: now,
      sourceEventIds: [...new Set([...thread.sourceEventIds, event.id])],
    }));
}
