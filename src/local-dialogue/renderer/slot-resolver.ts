import type { KnowledgeFact } from "../../memory/memory-types";
import { normalizeDialogueText } from "../nlu/normalize";
import type { CharacterResponsePlan, DialogueContext } from "../types";

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
  if (e.irritation > 0.58) return "немного раздражённая";
  if (e.sadness > 0.58) return "скорее грустная";
  if (e.anxiety > 0.58) return "слегка напряжённая";
  if (e.affection > 0.68 && context.relationship.closeness > 0.5) return "тёплая и спокойная";
  if (e.happiness > 0.65) return "в хорошем настроении";
  if (e.energy < 0.28) return "уставшая";
  if (e.curiosity > 0.68) return "любопытная";
  return "нормальная, довольно спокойная";
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
  };
  let missing = false;
  const resolved = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/gu, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === "") { missing = true; return ""; }
    return value;
  });
  return missing ? null : resolved;
}
