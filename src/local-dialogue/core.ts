/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import { normalizeDialogueText, tokenizeDialogue } from "./nlu";
import type { CharacterResponsePlan, DialogueHistoryLine, LocalNLUResult, RenderedResponse } from "./types";

// ---- seeded-random.ts ----
export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class SeededRandom {
  private state: number;

  constructor(seed: string | number) {
    const value = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
    this.state = value || 0x9e3779b9;
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  int(maxExclusive: number): number {
    if (maxExclusive <= 1) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(values: readonly T[]): T | undefined {
    return values.length ? values[this.int(values.length)] : undefined;
  }
}

// ---- cooldown.ts ----
export function templateOnCooldown(
  templateId: string,
  cooldownTurns: number,
  history: readonly DialogueHistoryLine[],
) {
  if (cooldownTurns <= 0) return false;
  const characterTurns = history.filter((line) => line.role === "character").slice(-cooldownTurns);
  return characterTurns.some((line) => line.templateId === templateId || line.templateId?.includes(templateId));
}

// ---- repetition-score.ts ----
function ngrams(tokens: string[], size: number) {
  const values = new Set<string>();
  for (let index = 0; index <= tokens.length - size; index += 1)
    values.add(tokens.slice(index, index + size).join(" "));
  return values;
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

export function repetitionScore(left: string, right: string): number {
  const a = tokenizeDialogue(left);
  const b = tokenizeDialogue(right);
  if (!a.length || !b.length) return 0;
  const unigram = jaccard(new Set(a), new Set(b));
  const bigram = jaccard(ngrams(a, 2), ngrams(b, 2));
  const trigram = jaccard(ngrams(a, 3), ngrams(b, 3));
  const na = normalizeDialogueText(left);
  const nb = normalizeDialogueText(right);
  const prefix = na.slice(0, 24) === nb.slice(0, 24) && Math.min(na.length, nb.length) >= 24 ? 1 : 0;
  const suffix = na.slice(-22) === nb.slice(-22) && Math.min(na.length, nb.length) >= 22 ? 1 : 0;
  return Math.min(1, unigram * 0.36 + bigram * 0.32 + trigram * 0.22 + prefix * 0.06 + suffix * 0.04);
}

export function maximumRecentSimilarity(candidate: string, recent: readonly string[]) {
  return recent.reduce((best, previous) => Math.max(best, repetitionScore(candidate, previous)), 0);
}

// ---- response-history.ts ----
export function recentCharacterResponses(history: readonly DialogueHistoryLine[], limit = 16) {
  return history
    .filter((line) => line.role === "character" && line.text.trim().length > 0)
    .slice(-Math.max(1, Math.min(limit, 40)))
    .map((line) => line.text);
}

// ---- debug-trace.ts ----
function isDevelopmentBuild() {
  return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
}

export function logLocalDialogueTrace(input: {
  userText?: string;
  nlu: LocalNLUResult;
  plan: CharacterResponsePlan;
  rendered: RenderedResponse;
}) {
  if (!isDevelopmentBuild()) return;
  console.debug("[Yuzuki Local Dialogue]", {
    userText: input.userText ?? "",
    nlu: input.nlu,
    characterPlan: {
      trigger: input.plan.trigger,
      sourceIntent: input.plan.sourceIntent,
      goal: input.plan.goal,
      dialogueActs: input.plan.dialogueActs,
      emotion: input.plan.emotion,
      tone: input.plan.tone,
      relationshipLevel: input.plan.relationshipLevel,
      responseLength: input.plan.responseLength,
      shouldAskQuestion: input.plan.shouldAskQuestion,
      topic: input.plan.topic,
    },
    selectedTemplate: input.rendered.templateId,
    finalResponse: input.rendered.text,
    fallbackLevel: input.rendered.fallbackLevel,
  });
}
