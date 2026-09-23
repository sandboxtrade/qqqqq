import { russianLanguagePack } from "../language-pack";
import type { IntentDefinition } from "../types";
import { normalizeDialogueText } from "./normalize";
import { tokenizeDialogue, tokenStem } from "./tokenize";

const NEGATION_RE = /(?:^|\s)(?:не|нет|неа|никогда|ни разу)(?:\s|$)/u;

export interface IntentScore {
  definition: IntentDefinition;
  score: number;
  matched: string[];
  blocked: boolean;
}

export function detectNegation(text: string): boolean {
  return NEGATION_RE.test(normalizeDialogueText(text));
}

function matchesNegativePattern(normalized: string, definition: IntentDefinition) {
  return definition.negativePatterns.some((pattern) => normalized.includes(normalizeDialogueText(pattern)));
}

export function scoreIntents(text: string, matchedConcepts: readonly string[]): IntentScore[] {
  const normalized = normalizeDialogueText(text);
  const tokens = tokenizeDialogue(text);
  const stems = new Set(tokens.map(tokenStem));
  const conceptSet = new Set(matchedConcepts);
  const scores: IntentScore[] = [];

  for (const definition of russianLanguagePack.intents) {
    if (definition.id === "unknown" || definition.id === "statement") continue;
    const matched: string[] = [];
    const blocked = matchesNegativePattern(normalized, definition);
    if (blocked) {
      scores.push({ definition, score: -1, matched, blocked: true });
      continue;
    }
    let raw = 0;
    for (const phrase of definition.patterns.phrases) {
      const target = normalizeDialogueText(phrase);
      if (normalized === target) { raw += 5; matched.push(`phrase:${phrase}`); }
      else if (target.length >= 3 && normalized.includes(target)) { raw += 3.5; matched.push(`phrase:${phrase}`); }
    }
    for (const pattern of definition.patterns.regex) {
      try {
        if (new RegExp(pattern, "iu").test(normalized)) { raw += 4.5; matched.push(`regex:${pattern}`); }
      } catch { /* invalid regex is reported by pack validation */ }
    }
    for (const token of definition.patterns.tokens) {
      const target = normalizeDialogueText(token);
      const stem = tokenStem(target);
      if (tokens.includes(target) || stems.has(stem)) { raw += 1.25; matched.push(`token:${token}`); }
    }
    if (raw <= 0) continue;
    for (const concept of definition.concepts) if (conceptSet.has(concept)) raw += 0.45;
    const score = raw + definition.priority / 110;
    scores.push({ definition, score, matched, blocked: false });
  }
  return scores.sort((a, b) => b.score - a.score || b.definition.priority - a.definition.priority || a.definition.id.localeCompare(b.definition.id));
}
