import type { CharacterEvent } from "../events/event-types";
import type { KnowledgeFact } from "./memory-types";

export interface FactCandidate {
  key: string;
  statement: string;
  value: string;
  confidence: number;
}

const cleanValue = (value: string) =>
  value
    .trim()
    .replace(/[.!?…]+$/u, "")
    .replace(/\s+/g, " ")
    .slice(0, 140);
const keyPart = (value: string) =>
  cleanValue(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

export function extractSemanticCandidates(text: string): FactCandidate[] {
  const source = text.trim();
  const lower = source.toLowerCase();
  const out: FactCandidate[] = [];

  const add = (candidate: FactCandidate | null) => {
    if (
      candidate &&
      candidate.value.length > 0 &&
      !out.some((x) => x.key === candidate.key && x.value === candidate.value)
    )
      out.push(candidate);
  };

  let match = source.match(/(?:^|[.!?]\s*)меня зовут\s+([\p{L}-]{2,40})/iu);
  if (match)
    add({
      key: "user.name",
      value: cleanValue(match[1]),
      statement: `Пользователя зовут ${cleanValue(match[1])}.`,
      confidence: 0.97,
    });

  match = source.match(
    /(?:^|[.!?]\s*)мне\s+(\d{1,3})\s+(?:лет|года?|год)(?![\p{L}\p{N}_])/iu,
  );
  if (match)
    add({
      key: "user.age",
      value: match[1],
      statement: `Пользователь сообщил, что ему ${match[1]} лет.`,
      confidence: 0.95,
    });

  // A negative residence correction is extracted first. If the same message also
  // contains a current residence ("живу в Москве ... больше не живу в Туле"),
  // the positive current residence is processed last and therefore remains the
  // active value for the exclusive user.residence key.
  if (/я\s+(?:больше\s+)?не\s+живу\s+/iu.test(lower)) {
    const correction = source.match(
      /я\s+(?:больше\s+)?не\s+живу\s+(?:в|на)\s+([^.!?]{2,80})/iu,
    );
    if (correction)
      add({
        key: "user.residence",
        value: `not:${cleanValue(correction[1])}`,
        statement: `Пользователь сообщил, что больше не живёт: ${cleanValue(correction[1])}.`,
        confidence: 0.9,
      });
  }

  match = source.match(/(?:^|[.!?]\s*)я\s+живу\s+(?:в|на)\s+([^.!?]{2,80})/iu);
  if (match)
    add({
      key: "user.residence",
      value: cleanValue(match[1]),
      statement: `Пользователь живёт: ${cleanValue(match[1])}.`,
      confidence: 0.9,
    });

  match = source.match(
    /(?:^|[.!?]\s*)я\s+работаю\s+(?:в|на|как)\s+([^.!?]{2,100})/iu,
  );
  if (match)
    add({
      key: "user.work",
      value: cleanValue(match[1]),
      statement: `Пользователь работает: ${cleanValue(match[1])}.`,
      confidence: 0.86,
    });

  const preferencePatterns: Array<{
    regex: RegExp;
    sentiment: "like" | "dislike";
  }> = [
    {
      regex: /(?:^|[.!?]\s*)я\s+(?:очень\s+)?люблю\s+([^.!?]{2,100})/iu,
      sentiment: "like",
    },
    {
      regex: /(?:^|[.!?]\s*)мне\s+(?:очень\s+)?нравится\s+([^.!?]{2,100})/iu,
      sentiment: "like",
    },
    {
      regex: /(?:^|[.!?]\s*)я\s+не\s+люблю\s+([^.!?]{2,100})/iu,
      sentiment: "dislike",
    },
    {
      regex: /(?:^|[.!?]\s*)мне\s+не\s+нравится\s+([^.!?]{2,100})/iu,
      sentiment: "dislike",
    },
  ];

  for (const { regex, sentiment } of preferencePatterns) {
    const pref = source.match(regex);
    if (!pref) continue;
    const target = cleanValue(pref[1]);
    const targetKey = keyPart(target);
    if (targetKey) {
      add({
        key: `user.preference.${targetKey}`,
        value: sentiment,
        statement:
          sentiment === "like"
            ? `Пользователю нравится ${target}.`
            : `Пользователю не нравится ${target}.`,
        confidence: 0.84,
      });
    }
  }

  return out;
}

export function factFromCandidate(
  candidate: FactCandidate,
  event: CharacterEvent,
  now = Date.now(),
): KnowledgeFact {
  return {
    id: `fact_${event.id}_${candidate.key.replace(/[^a-z0-9а-яё_.-]+/giu, "_")}_${keyPart(candidate.value) || "value"}`,
    subject: "user",
    key: candidate.key,
    statement: candidate.statement,
    value: candidate.value,
    confidence: candidate.confidence,
    evidenceCount: 1,
    sourceEventIds: [event.id],
    sourceMemoryIds: [],
    createdAt: now,
    updatedAt: now,
    lastConfirmedAt: now,
    validFrom: event.timestamp,
    status: "active",
  };
}
