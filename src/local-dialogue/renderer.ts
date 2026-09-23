/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { KnowledgeFact } from "../memory/model";
import { maximumRecentSimilarity, recentCharacterResponses, SeededRandom, templateOnCooldown } from "./core";
import { russianLanguagePack } from "./language-pack";
import { normalizeDialogueText } from "./nlu";
import { fallbackKey } from "./planner";
import type { CharacterResponsePlan, DialogueAct, DialogueContext, DialogueTemplate, ReactionFragment, RejectedTemplate, RenderedResponse, ResponseRenderer } from "./types";

// ---- slot-resolver.ts ----
function activeFacts(context: DialogueContext) {
  return context.memoryContext.facts.filter((fact) => fact.status === "active");
}

export function selectRelevantMemoryFact(context: DialogueContext): KnowledgeFact | undefined {
  const text = normalizeDialogueText(context.userText ?? "");
  const facts = activeFacts(context);
  const preferredKey = /(?:как меня зовут|имя)/u.test(text) ? "user.name"
    : /(?:сколько мне лет|возраст)/u.test(text) ? "user.age"
      : /(?:где я работаю|работ)/u.test(text) ? "user.work"
        : /(?:где я живу|живу|город)/u.test(text) ? "user.residence"
          : undefined;
  if (preferredKey) return facts.find((fact) => fact.key === preferredKey);
  return facts[0];
}

export function hasRelevantMemory(context: DialogueContext) {
  return Boolean(selectRelevantMemoryFact(context) ?? context.memoryContext.memories[0]);
}

function memoryStatement(fact: KnowledgeFact | undefined, context: DialogueContext) {
  if (!fact) return context.memoryContext.memories[0]?.summary;
  if (fact.key === "user.name") return `тебя зовут ${fact.value}`;
  if (fact.key === "user.age") return `тебе ${fact.value} лет`;
  if (fact.key === "user.residence") {
    if (fact.value.startsWith("not:")) return `ты больше не живёшь там: ${fact.value.slice(4)}`;
    return `про место, где ты живёшь, у меня осталось: ${fact.value}`;
  }
  if (fact.key === "user.work") return `про твою работу у меня осталось: ${fact.value}`;
  if (fact.key.startsWith("user.preference.")) return fact.statement
    .replace(/^Пользователю/u, "тебе")
    .replace(/^пользователю/u, "тебе")
    .replace(/[.]$/u, "");
  return fact.statement.replace(/^Пользователь(?: сообщил, что)?/u, "ты говорил, что").replace(/[.]$/u, "");
}

function userName(context: DialogueContext) {
  return activeFacts(context).find((fact) => fact.key === "user.name")?.value;
}

function stateDescription(context: DialogueContext) {
  const e = context.emotion;
  const text = normalizeDialogueText(context.userText ?? "");
  const asksMood = /(?:настроен|как дела|ты как|как ты|самочувств)/u.test(text);
  if (e.irritation > 0.58) return asksMood ? "немного раздражённая, но нормально" : "немного раздражённая";
  if (e.sadness > 0.58) return asksMood ? "немного грустная сегодня" : "скорее грустная";
  if (e.anxiety > 0.58) return asksMood ? "немного напряжённая" : "слегка напряжённая";
  if (e.energy < 0.28) return asksMood ? "подуставшая, но в целом нормально" : "уставшая";
  if (e.happiness > 0.65) return "в хорошем настроении";
  if (e.affection > 0.68 && context.relationship.closeness > 0.5) return "тёплая и спокойная";
  if (!asksMood && e.curiosity > 0.74) return "любопытная";
  return "спокойная, всё нормально";
}

const ACTIVITY: Record<DialogueContext["world"]["currentActivity"], string> = {
  sleeping: "сплю", waking_up: "просыпаюсь", breakfast: "завтракаю",
  personal_project: "занимаюсь своим проектом", reading: "читаю", music: "слушаю музыку",
  walk: "гуляю", cooking: "готовлю", errands: "разбираюсь с делами", cafe_break: "сижу в кафе",
  relaxing: "отдыхаю", chatting: "болтаю с тобой", idle: "ничем особенным не занята",
};

function relationshipDescription(context: DialogueContext) {
  switch (context.relationship.stage) {
    case "deep": return "ты мне очень близок";
    case "close": return "ты мне близок";
    case "familiar": return "мне с тобой уже довольно комфортно";
    default: return "мы пока только узнаём друг друга";
  }
}

function semanticValue(plan: CharacterResponsePlan, key: string) {
  const value = plan.semanticPayload?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

export function resolveSlots(
  template: string,
  plan: CharacterResponsePlan,
  context: DialogueContext,
): string | null {
  const fact = selectRelevantMemoryFact(context);
  const memoryValue = fact?.value ?? context.memoryContext.memories[0]?.summary;
  const values: Record<string, string | undefined> = {
    "user.name": userName(context),
    "character.name": context.character.name,
    "character.age": String(context.character.age),
    "character.state": stateDescription(context),
    "character.angerAnswer": context.emotion.irritation > 0.5 ? "Да, немного злюсь." : context.emotion.irritation > 0.28 ? "Есть немного раздражения, но не сказать, что я прямо злюсь." : "Нет, сейчас я не злюсь.",
    "character.sadnessAnswer": context.emotion.sadness > 0.5 ? "Да, мне сейчас немного грустно." : "Нет, сейчас я не особенно грущу.",
    "relationship.description": relationshipDescription(context),
    "memory.value": memoryValue,
    "memory.statement": memoryStatement(fact, context),
    "topic": plan.topic,
    "timeOfDay": context.world.timeOfDay,
    "world.activity": ACTIVITY[context.world.currentActivity],
    "initiative.topic": context.initiative?.topic,
    "semantic.summary": semanticValue(plan, "summary"),
    "semantic.continuation": semanticValue(plan, "continuation"),
    "semantic.focus": semanticValue(plan, "focus"),
    "semantic.reason": semanticValue(plan, "reason"),
    "semantic.alternative": semanticValue(plan, "alternative"),
  };
  let missing = false;
  const resolved = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/gu, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === "") { missing = true; return ""; }
    return value;
  });
  return missing ? null : resolved;
}

// ---- variation-selector.ts ----
export interface VariantChoice {
  text: string;
  similarity: number;
}

export function chooseVariant(
  variants: readonly string[],
  seedNamespace: string,
  plan: CharacterResponsePlan,
  context: DialogueContext,
): VariantChoice | null {
  const recent = recentCharacterResponses(context.history, 16);
  const candidates = variants.flatMap((variant) => {
    const text = resolveSlots(variant, plan, context);
    if (!text) return [];
    return [{ text, similarity: maximumRecentSimilarity(text, recent) }];
  });
  if (!candidates.length) return null;
  const lastResponse = recent.at(-1);
  const withoutImmediateRepeat = lastResponse
    ? candidates.filter((candidate) => candidate.text !== lastResponse)
    : candidates;
  const basePool = withoutImmediateRepeat.length ? withoutImmediateRepeat : candidates;
  const lowest = Math.min(...basePool.map((candidate) => candidate.similarity));
  const similarityFiltered = basePool.filter(
    (candidate) => candidate.similarity <= Math.min(0.86, lowest + 0.13),
  );
  const pool = similarityFiltered.length
    ? similarityFiltered
    : basePool.filter((candidate) => candidate.similarity === lowest);
  const rng = new SeededRandom(`${context.turnId}|${seedNamespace}|${plan.sourceIntent}`);
  return pool[rng.int(pool.length)] ?? basePool[0] ?? candidates[0];
}

// ---- phrase-composer.ts ----
function matches(fragment: ReactionFragment, act: DialogueAct, plan: CharacterResponsePlan, context: DialogueContext) {
  if (fragment.act !== act) return false;
  if (fragment.intents?.length && !fragment.intents.includes(plan.sourceIntent)) return false;
  if (fragment.tones?.length && !fragment.tones.some((tone) => plan.tone.includes(tone))) return false;
  if (fragment.relationship?.length && !fragment.relationship.includes(context.relationship.stage)) return false;
  if (fragment.conceptsAny?.length && !fragment.conceptsAny.some((concept) => context.nlu.matchedConcepts.includes(concept))) return false;
  return true;
}

function specificity(fragment: ReactionFragment) {
  return (fragment.intents?.length ? 4 : 0) + (fragment.tones?.length ? 2 : 0) + (fragment.relationship?.length ? 2 : 0) + (fragment.conceptsAny?.length ? 2 : 0);
}

function actLimit(plan: CharacterResponsePlan) {
  switch (plan.responseLength) {
    case "very_short": return 1;
    case "short": return 2;
    case "medium": return 3;
    case "long": return 4;
  }
}

function pickFragment(act: DialogueAct, plan: CharacterResponsePlan, context: DialogueContext) {
  const candidates = russianLanguagePack.reactions
    .filter((fragment) => matches(fragment, act, plan, context))
    .sort((a, b) => specificity(b) - specificity(a) || Number(templateOnCooldown(a.id, a.cooldownTurns, context.history)) - Number(templateOnCooldown(b.id, b.cooldownTurns, context.history)) || b.weight - a.weight || a.id.localeCompare(b.id));
  if (!candidates.length) return null;
  const bestSpecificity = specificity(candidates[0]);
  let pool = candidates.filter((entry) => specificity(entry) === bestSpecificity && !templateOnCooldown(entry.id, entry.cooldownTurns, context.history));
  if (!pool.length) pool = candidates.filter((entry) => specificity(entry) === bestSpecificity);
  const rng = new SeededRandom(`${context.turnId}|fragment|${act}|${plan.sourceIntent}`);
  const fragment = pool[rng.int(pool.length)] ?? candidates[0];
  const choice = chooseVariant(fragment.variants, fragment.id, plan, context);
  return choice ? { id: fragment.id, ...choice } : null;
}

export function composeFromActs(plan: CharacterResponsePlan, context: DialogueContext) {
  if (plan.dialogueActs.includes("SILENCE")) return { text: "", ids: ["act.silence"], similarity: 0 };
  const selected: Array<{ id: string; text: string; similarity: number }> = [];
  const max = actLimit(plan);
  for (const act of plan.dialogueActs) {
    if (selected.length >= max) break;
    if (act === "FOLLOW_UP" && !plan.shouldAskQuestion) continue;
    const fragment = pickFragment(act, plan, context);
    if (fragment) selected.push(fragment);
  }
  if (!selected.length) return null;
  return {
    text: selected.map((entry) => entry.text).join(" "),
    ids: selected.map((entry) => entry.id),
    similarity: Math.max(...selected.map((entry) => entry.similarity)),
  };
}

// ---- post-process.ts ----
const TECHNICAL_RE = /(?:\[object Object\]|undefined|null\b|(?:intent|template|dialogue)[_.:-][a-z0-9_]+|\{\{[^{}]+\}\})/iu;

export function postProcessDialogue(text: string): string {
  const cleaned = text
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.!?;:])/gu, "$1")
    .replace(/([!?.,])\1{1,}/gu, "$1")
    .replace(/\.\s*\./gu, ".")
    .replace(/\s+([…])/gu, "$1")
    .trim();
  if (!cleaned) return "";
  const first = cleaned.search(/[\p{L}\p{N}]/u);
  if (first < 0) return cleaned;
  return `${cleaned.slice(0, first)}${cleaned[first].toLocaleUpperCase("ru-RU")}${cleaned.slice(first + 1)}`;
}

export function isSafeRenderedText(text: string) {
  return !TECHNICAL_RE.test(text);
}

export function openingPhrase(text: string) {
  const normalized = text.trim();
  if (!normalized) return undefined;
  const match = normalized.match(/^(.{1,48}?)(?:[.!?…]|$)/u);
  return match?.[1]?.trim() || normalized.slice(0, 48);
}

// ---- template-selector.ts ----
function intersects(left: readonly string[] | undefined, right: readonly string[]) {
  return !left?.length || left.some((value) => right.includes(value));
}

function matchTemplate(template: DialogueTemplate, plan: CharacterResponsePlan, context: DialogueContext): string | null {
  const conditions = template.conditions;
  if (conditions.intents?.length && !conditions.intents.includes(plan.sourceIntent)) return "intent";
  if (conditions.actsAny?.length && !conditions.actsAny.some((act) => plan.dialogueActs.includes(act))) return "actsAny";
  if (conditions.actsAll?.length && !conditions.actsAll.every((act) => plan.dialogueActs.includes(act))) return "actsAll";
  if (conditions.tones?.length && !intersects(conditions.tones, plan.tone)) return "tone";
  if (conditions.relationship?.length && !conditions.relationship.includes(context.relationship.stage)) return "relationship";
  if (conditions.conceptsAny?.length && !intersects(conditions.conceptsAny, context.nlu.matchedConcepts)) return "concept";
  if (conditions.questionTypes?.length && (!context.nlu.questionType || !conditions.questionTypes.includes(context.nlu.questionType))) return "questionType";
  if (conditions.minConfidence !== undefined && context.nlu.confidence < conditions.minConfidence) return "confidence-min";
  if (conditions.maxConfidence !== undefined && context.nlu.confidence > conditions.maxConfidence) return "confidence-max";
  if (conditions.memoryRequired !== undefined && hasRelevantMemory(context) !== conditions.memoryRequired) return "memory";
  if (conditions.initiativeKinds?.length && (!context.initiative || !conditions.initiativeKinds.includes(context.initiative.kind))) return "initiative";
  return null;
}

export function templateFallbackLevel(template: DialogueTemplate) {
  const c = template.conditions;
  if (c.initiativeKinds?.length) return 0;
  if (c.intents?.length && (c.relationship?.length || c.tones?.length || c.conceptsAny?.length || c.memoryRequired !== undefined)) return 0;
  if (c.intents?.length && (c.actsAny?.length || c.actsAll?.length)) return 1;
  if (c.intents?.length) return 2;
  if (c.actsAny?.length || c.actsAll?.length || c.questionTypes?.length) return 3;
  return 4;
}

export function selectTemplateCandidates(plan: CharacterResponsePlan, context: DialogueContext) {
  const accepted: Array<{ template: DialogueTemplate; level: number; coolingDown: boolean }> = [];
  const rejected: RejectedTemplate[] = [];
  for (const template of russianLanguagePack.templates) {
    const reason = matchTemplate(template, plan, context);
    if (reason) {
      if (rejected.length < 30) rejected.push({ id: template.id, reason });
      continue;
    }
    accepted.push({
      template,
      level: templateFallbackLevel(template),
      coolingDown: templateOnCooldown(template.id, template.cooldownTurns, context.history),
    });
  }
  accepted.sort((a, b) => a.level - b.level || Number(a.coolingDown) - Number(b.coolingDown) || b.template.weight - a.template.weight || a.template.id.localeCompare(b.template.id));
  return { accepted, rejected };
}

// ---- local-dialogue-renderer.ts ----
function chooseFallback(plan: CharacterResponsePlan, context: DialogueContext) {
  const key = fallbackKey(plan, context);
  const variants = russianLanguagePack.fallbacks[key] ?? russianLanguagePack.fallbacks.generic ?? ["Я тебя слушаю."];
  const rng = new SeededRandom(`${context.turnId}|fallback|${key}`);
  return { key, text: variants[rng.int(variants.length)] ?? "Я тебя слушаю." };
}

function authoritative(plan: CharacterResponsePlan) {
  const direct = plan.semanticPayload?.authoritativeText;
  if (typeof direct === "string") return { id: "semantic.authoritative", text: direct };
  const locked = plan.semanticPayload?.lockedText;
  if (plan.decision.content.locked && typeof locked === "string" && locked.trim()) return { id: "decision.locked", text: locked };
  return null;
}

export class LocalDialogueRenderer implements ResponseRenderer {
  async render(plan: CharacterResponsePlan, context: DialogueContext): Promise<RenderedResponse> {
    try {
      return this.renderInternal(plan, context);
    } catch (error) {
      if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
        console.error("[Yuzuki Local Dialogue] renderer fallback", error);
      const fallback = "Я тебя слушаю.";
      return this.result(fallback, "fallback:renderer-error", 5, 0, plan, context, []);
    }
  }

  private renderInternal(plan: CharacterResponsePlan, context: DialogueContext): RenderedResponse {
    if (plan.dialogueActs.includes("SILENCE") || plan.decision.action === "stay_silent")
      return this.result("", "silence", 0, 0, plan, context, []);

    const direct = authoritative(plan);
    if (direct) {
      const text = postProcessDialogue(direct.text);
      if (text && isSafeRenderedText(text)) return this.result(text, direct.id, 0, maximumRecentSimilarity(text, recentCharacterResponses(context.history)), plan, context, []);
    }

    const { accepted, rejected } = selectTemplateCandidates(plan, context);
    const withoutCooldown = accepted.filter((candidate) => !candidate.coolingDown);
    const templatePool = withoutCooldown.length ? withoutCooldown : accepted;
    const recent = recentCharacterResponses(context.history, 16);
    const renderedCandidates = templatePool.flatMap((candidate) => {
      const choice = chooseVariant(candidate.template.variants, candidate.template.id, plan, context);
      if (!choice) return [];
      return [{ ...candidate, choice }];
    });

    if (renderedCandidates.length) {
      const bestLevel = Math.min(...renderedCandidates.map((candidate) => candidate.level));
      const levelPool = renderedCandidates.filter((candidate) => candidate.level === bestLevel);
      const bestSimilarity = Math.min(...levelPool.map((candidate) => candidate.choice.similarity));
      const similarityFiltered = levelPool.filter(
        (candidate) => candidate.choice.similarity <= Math.min(0.86, bestSimilarity + 0.12),
      );
      // When every remaining variant is necessarily similar (for example the
      // user sends the same sentence many times), never let anti-repetition
      // turn an otherwise valid response into a renderer failure. Keep the
      // least-similar candidates and let the cooldown/seeded selector choose
      // among them.
      const similarityPool = similarityFiltered.length
        ? similarityFiltered
        : levelPool.filter((candidate) => candidate.choice.similarity === bestSimilarity);
      const rng = new SeededRandom(`${context.turnId}|template|${plan.sourceIntent}`);
      const weighted = similarityPool.flatMap((candidate) => Array.from({ length: Math.max(1, Math.min(6, Math.round(candidate.template.weight * 2))) }, () => candidate));
      const selected = weighted[rng.int(weighted.length)] ?? similarityPool[0];
      const text = postProcessDialogue(selected.choice.text);
      if (text && isSafeRenderedText(text)) return this.result(text, selected.template.id, selected.level, selected.choice.similarity, plan, context, rejected);
    }

    const composed = composeFromActs(plan, context);
    if (composed) {
      const text = postProcessDialogue(composed.text);
      if (text && isSafeRenderedText(text)) return this.result(text, `composed:${composed.ids.join("+")}`, 3, composed.similarity, plan, context, rejected);
    }

    const fallback = chooseFallback(plan, context);
    const fallbackText = postProcessDialogue(fallback.text);
    const safe = isSafeRenderedText(fallbackText) ? fallbackText : "Я тебя слушаю.";
    return this.result(safe, `fallback:${fallback.key}`, 5, maximumRecentSimilarity(safe, recent), plan, context, rejected);
  }

  private result(
    text: string,
    templateId: string,
    fallbackLevel: number,
    similarityScore: number,
    plan: CharacterResponsePlan,
    context: DialogueContext,
    rejectedTemplates: Array<{ id: string; reason: string }>,
  ): RenderedResponse {
    return {
      text,
      templateId,
      openingPhrase: openingPhrase(text),
      dialogueActs: plan.dialogueActs,
      fallbackLevel,
      debug: {
        detectedIntent: context.nlu.intent,
        confidence: context.nlu.confidence,
        concepts: context.nlu.matchedConcepts,
        selectedActs: plan.dialogueActs,
        selectedTemplate: templateId,
        rejectedTemplates,
        relationshipBand: context.relationship.stage,
        emotion: plan.emotion,
        fallbackLevel,
        similarityScore,
        languagePackIssues: russianLanguagePack.issues,
      },
    };
  }
}

// ---- response-renderer.ts ----
export type { ResponseRenderer } from "./types";
