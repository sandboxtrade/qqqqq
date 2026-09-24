import type { CharacterEvent } from "../events/event-types";
import {
  characterViewTopicKey,
  encodeCharacterViewValue,
  type CharacterMindContinuityPayload,
  type CharacterViewPosition,
  type CharacterViewReason,
  type KnowledgeFact,
} from "./model";

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


const POSITION_LABEL: Record<CharacterViewPosition, string> = {
  positive: "скорее положительно",
  negative: "скорее отрицательно",
  mixed: "неоднозначно",
  cautious: "с осторожностью",
  curious: "с интересом, оставляя мнение открытым",
};

const REASON_LABEL: Record<CharacterViewReason, string> = {
  honesty: "для неё здесь важна честность",
  reciprocity: "для неё важна взаимность",
  autonomy: "для неё важны свобода выбора и самостоятельность",
  consistency: "для неё важна последовательность",
  comfort: "для неё важен внутренний комфорт",
  curiosity: "ей важно оставлять место любопытству",
  depth: "ей важны смысл и глубина",
  respect: "для неё важно уважение к другому человеку",
  experience: "она опирается на собственное ощущение и опыт",
};


function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function characterOpinionFactFromMind(
  mind: CharacterMindContinuityPayload,
  event: CharacterEvent,
  now = Date.now(),
): KnowledgeFact | null {
  const topic = cleanValue(mind.topic);
  const topicKey = characterViewTopicKey(mind.topicKey || topic);
  if (!topic || !topicKey || mind.persistence < 0.58) return null;
  const value = encodeCharacterViewValue({
    topic,
    position: mind.position,
    reason: mind.reason,
  });
  return {
    id: `fact_${event.id}_character_opinion_${topicKey}`,
    subject: "character",
    key: `character.opinion.${topicKey}`,
    statement: `Yuzuki относится к теме «${topic}» ${POSITION_LABEL[mind.position]}; ${REASON_LABEL[mind.reason]}.`,
    value,
    confidence: clamp01(Math.max(0.45, mind.confidence)),
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

export function characterTensionFactFromMind(
  mind: CharacterMindContinuityPayload,
  event: CharacterEvent,
  now = Date.now(),
): KnowledgeFact | null {
  const topic = cleanValue(mind.topic);
  const topicKey = characterViewTopicKey(mind.topicKey || topic);
  if (!topic || !topicKey || !mind.reconsideration || !mind.challengeDirection) return null;
  const integrated = Boolean(mind.changedFrom);
  const direction = mind.challengeDirection;
  return {
    id: `fact_${event.id}_character_tension_${topicKey}`,
    subject: "character",
    key: `character.tension.${topicKey}`,
    statement: integrated
      ? `Yuzuki уже встроила встречный аргумент по теме «${topic}» и постепенно скорректировала позицию.`
      : `У Yuzuki появилось реальное сомнение по теме «${topic}», но одного встречного аргумента пока недостаточно, чтобы перевернуть её позицию.`,
    value: `${integrated ? "integrated" : "challenge"}|${direction}`,
    confidence: clamp01(Math.max(0.48, mind.confidence - (integrated ? 0 : 0.08))),
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
