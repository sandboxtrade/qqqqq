import conceptsJson from "./language/ru/concepts.json" with { type: "json" };
import connectorsJson from "./language/ru/connectors.json" with { type: "json" };
import fallbacksJson from "./language/ru/fallbacks.json" with { type: "json" };
import intentsJson from "./language/ru/intents.json" with { type: "json" };
import reactionsJson from "./language/ru/reactions.json" with { type: "json" };
import templatesJson from "./language/ru/templates.json" with { type: "json" };
import topicsJson from "./language/ru/topics.json" with { type: "json" };
import vocabularyJson from "./language/ru/vocabulary.json" with { type: "json" };
import type {
  ConceptDefinition,
  DialogueAct,
  DialogueTemplate,
  IntentDefinition,
  LanguagePack,
  ReactionFragment,
} from "./types";

const KNOWN_ACTS = new Set<DialogueAct>([
  "ACKNOWLEDGE", "ANSWER", "AGREE", "DISAGREE", "REASSURE", "CARE", "COMFORT",
  "SUGGEST_REST", "TEASE", "FLIRT", "JOKE", "ASK", "FOLLOW_UP", "REMEMBER",
  "REFER_MEMORY", "SURPRISE", "HAPPINESS", "SADNESS", "JEALOUSY", "CURIOSITY",
  "APOLOGY", "GRATITUDE", "BOUNDARY", "REFUSE", "CHANGE_TOPIC", "SILENCE",
  "GOOD_MORNING", "GOOD_NIGHT", "WELCOME_BACK", "MISS_USER", "CONTINUE_TOPIC",
  "CLARIFY", "SHARE",
]);
const ALLOWED_SLOTS = new Set([
  "user.name", "character.name", "character.age", "character.state", "character.angerAnswer", "character.sadnessAnswer", "relationship.description",
  "memory.value", "memory.statement", "topic", "timeOfDay", "world.activity", "initiative.topic",
  "semantic.summary", "semantic.continuation",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function schemaOne(value: unknown, label: string, issues: string[]) {
  if (!isRecord(value) || value.schemaVersion !== 1) issues.push(`${label}: schemaVersion must be 1`);
}
function duplicateIssues(ids: string[], label: string, issues: string[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) issues.push(`${label}: duplicate id ${id}`);
    seen.add(id);
  }
}
function slotIssues(text: string, owner: string, issues: string[]) {
  for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/gu)) {
    if (!ALLOWED_SLOTS.has(match[1])) issues.push(`${owner}: unknown slot ${match[1]}`);
  }
}

function readIntents(raw: unknown, issues: string[]): IntentDefinition[] {
  schemaOne(raw, "intents", issues);
  if (!isRecord(raw) || !Array.isArray(raw.intents)) return [];
  const output: IntentDefinition[] = [];
  for (const value of raw.intents) {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.priority !== "number" || !isRecord(value.patterns)) {
      issues.push("intents: invalid intent entry");
      continue;
    }
    const phrases = value.patterns.phrases;
    const tokens = value.patterns.tokens;
    const regex = value.patterns.regex;
    const negativePatterns = value.negativePatterns;
    const concepts = value.concepts;
    if (
      !stringArray(phrases) ||
      !stringArray(tokens) ||
      !stringArray(regex) ||
      !stringArray(negativePatterns) ||
      !stringArray(concepts)
    ) {
      issues.push(`intent ${value.id}: pattern arrays must contain strings`);
      continue;
    }
    for (const pattern of regex) {
      try { new RegExp(pattern, "iu"); } catch { issues.push(`intent ${value.id}: invalid regex ${pattern}`); }
    }
    output.push(value as unknown as IntentDefinition);
  }
  duplicateIssues(output.map((entry) => entry.id), "intents", issues);
  return output;
}

function readConcepts(raw: unknown, issues: string[]): ConceptDefinition[] {
  schemaOne(raw, "concepts", issues);
  if (!isRecord(raw) || !isRecord(raw.concepts)) return [];
  const output: ConceptDefinition[] = [];
  for (const [id, value] of Object.entries(raw.concepts)) {
    if (!isRecord(value) || !stringArray(value.tokens) || !stringArray(value.phrases)) {
      issues.push(`concept ${id}: invalid definition`);
      continue;
    }
    output.push({ id, ...(value as unknown as Omit<ConceptDefinition, "id">) });
  }
  return output;
}

function readTemplates(raw: unknown, intentIds: Set<string>, issues: string[]): DialogueTemplate[] {
  schemaOne(raw, "templates", issues);
  if (!isRecord(raw) || !Array.isArray(raw.templates)) return [];
  const output: DialogueTemplate[] = [];
  for (const value of raw.templates) {
    if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.conditions) || !stringArray(value.variants) || value.variants.length === 0 || typeof value.weight !== "number" || typeof value.cooldownTurns !== "number") {
      issues.push("templates: invalid template entry");
      continue;
    }
    const conditions = value.conditions;
    if (conditions.intents !== undefined && (!stringArray(conditions.intents) || conditions.intents.some((id) => !intentIds.has(id))))
      issues.push(`template ${value.id}: unknown intent in conditions`);
    for (const key of ["actsAny", "actsAll"] as const) {
      const acts = conditions[key];
      if (acts !== undefined && (!stringArray(acts) || acts.some((act) => !KNOWN_ACTS.has(act as DialogueAct))))
        issues.push(`template ${value.id}: unknown dialogue act`);
    }
    for (const variant of value.variants) slotIssues(variant, `template ${value.id}`, issues);
    output.push(value as unknown as DialogueTemplate);
  }
  duplicateIssues(output.map((entry) => entry.id), "templates", issues);
  return output;
}

function readReactions(raw: unknown, intentIds: Set<string>, issues: string[]): ReactionFragment[] {
  schemaOne(raw, "reactions", issues);
  if (!isRecord(raw) || !Array.isArray(raw.reactions)) return [];
  const output: ReactionFragment[] = [];
  for (const value of raw.reactions) {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.act !== "string" || !KNOWN_ACTS.has(value.act as DialogueAct) || !stringArray(value.variants) || value.variants.length === 0 || typeof value.weight !== "number" || typeof value.cooldownTurns !== "number") {
      issues.push("reactions: invalid reaction entry");
      continue;
    }
    if (value.intents !== undefined && (!stringArray(value.intents) || value.intents.some((id) => !intentIds.has(id))))
      issues.push(`reaction ${value.id}: unknown intent`);
    for (const variant of value.variants) slotIssues(variant, `reaction ${value.id}`, issues);
    output.push(value as unknown as ReactionFragment);
  }
  duplicateIssues(output.map((entry) => entry.id), "reactions", issues);
  return output;
}

function readStringMap(raw: unknown, key: string, issues: string[]) {
  schemaOne(raw, key, issues);
  if (!isRecord(raw) || !isRecord(raw[key])) return {};
  const output: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(raw[key] as Record<string, unknown>)) {
    if (!stringArray(value)) issues.push(`${key}.${name}: expected string[]`);
    else output[name] = value;
  }
  return output;
}

function readTopics(raw: unknown, issues: string[]) {
  schemaOne(raw, "topics", issues);
  if (!isRecord(raw) || !isRecord(raw.topics)) return {};
  const output: Record<string, { tokens: string[]; phrases: string[] }> = {};
  for (const [id, value] of Object.entries(raw.topics)) {
    if (!isRecord(value) || !stringArray(value.tokens) || !stringArray(value.phrases)) issues.push(`topic ${id}: invalid definition`);
    else output[id] = { tokens: value.tokens, phrases: value.phrases };
  }
  return output;
}

function readVocabulary(raw: unknown, issues: string[]) {
  schemaOne(raw, "vocabulary", issues);
  if (!isRecord(raw) || !isRecord(raw.vocabulary)) return {};
  const output: Record<string, Record<string, string[]>> = {};
  for (const [group, rawValues] of Object.entries(raw.vocabulary)) {
    if (!isRecord(rawValues)) { issues.push(`vocabulary.${group}: invalid group`); continue; }
    const values: Record<string, string[]> = {};
    for (const [name, value] of Object.entries(rawValues)) {
      if (!stringArray(value)) issues.push(`vocabulary.${group}.${name}: expected string[]`);
      else values[name] = value;
    }
    output[group] = values;
  }
  return output;
}

export function loadRussianLanguagePack(): LanguagePack {
  const issues: string[] = [];
  const intents = readIntents(intentsJson, issues);
  const intentIds = new Set(intents.map((entry) => entry.id));
  const concepts = readConcepts(conceptsJson, issues);
  const conceptIds = new Set(concepts.map((entry) => entry.id));
  for (const definition of intents) {
    for (const concept of definition.concepts) if (!conceptIds.has(concept)) issues.push(`intent ${definition.id}: unknown concept ${concept}`);
  }
  return {
    intents,
    concepts,
    templates: readTemplates(templatesJson, intentIds, issues),
    reactions: readReactions(reactionsJson, intentIds, issues),
    fallbacks: readStringMap(fallbacksJson, "fallbacks", issues),
    connectors: readStringMap(connectorsJson, "connectors", issues),
    vocabulary: readVocabulary(vocabularyJson, issues),
    topics: readTopics(topicsJson, issues),
    issues,
  };
}

export const russianLanguagePack = loadRussianLanguagePack();

export function reportRussianLanguagePackIssues() {
  if (!russianLanguagePack.issues.length) return;
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (env?.DEV) console.error("[Yuzuki Local Dialogue] language pack issues", russianLanguagePack.issues);
}
