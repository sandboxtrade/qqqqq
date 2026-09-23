import { russianLanguagePack } from "../language-pack";
import type { LocalNLUResult, LocalSentiment } from "../types";
import { extractEntities } from "./entity-extractor";
import { detectNegation, scoreIntents } from "./intent-classifier";
import { normalizeDialogueText } from "./normalize";
import { classifyQuestion } from "./question-classifier";
import { detectSentiment } from "./sentiment";
import { classifyTopic } from "./topic-classifier";
import { tokenizeDialogue, tokenStem } from "./tokenize";

function matchedConcepts(text: string) {
  const normalized = normalizeDialogueText(text);
  const tokens = tokenizeDialogue(text);
  const stems = new Set(tokens.map(tokenStem));
  const matches: string[] = [];
  for (const concept of russianLanguagePack.concepts) {
    const phraseHit = concept.phrases.some((phrase) => normalized.includes(normalizeDialogueText(phrase)));
    const tokenHit = concept.tokens.some((token) => stems.has(tokenStem(normalizeDialogueText(token))));
    if (phraseHit || tokenHit) matches.push(concept.id);
  }
  return matches;
}

function inferIntensity(text: string, sentiment: LocalSentiment) {
  const normalized = normalizeDialogueText(text);
  let value = sentiment === "very_negative" || sentiment === "very_positive" ? 0.85 : sentiment === "negative" || sentiment === "positive" ? 0.58 : 0.35;
  if (/(?:очень|совсем|ужасно|реально|прям|вообще|крайне|безумно)/u.test(normalized)) value += 0.14;
  if (/!{2,}/u.test(text)) value += 0.08;
  return Math.max(0, Math.min(1, value));
}

export function analyzeLocalNLU(text: string): LocalNLUResult {
  const normalized = normalizeDialogueText(text);
  const concepts = matchedConcepts(text);
  const negation = detectNegation(text);
  const scores = scoreIntents(text, concepts);
  const top = scores.find((score) => !score.blocked && score.score > 0);
  const question = classifyQuestion(text);

  let intent = top?.definition.id ?? (question.isQuestion ? "unknown" : normalized ? "statement" : "unknown");
  // Very short contextual phrases should keep their dedicated intent when possible.
  if (/^(?:а\s+)?ты[?.! ]*$/u.test(normalized)) intent = "ask_followup";

  const topScore = top?.score ?? 0;
  const confidence = top
    ? Math.max(0.4, Math.min(0.99, 0.38 + topScore / 8.5))
    : normalized.length > 2 ? 0.28 : 0.18;
  const secondaryIntents = scores
    .filter((entry) => !entry.blocked && entry.definition.id !== intent && entry.score >= Math.max(2.2, topScore - 1.35))
    .slice(0, 4)
    .map((entry) => entry.definition.id);
  const hintedSentiment = top?.definition.sentiment;
  const sentiment = hintedSentiment ?? detectSentiment(text, undefined, negation);
  const topic = top?.definition.topic ?? classifyTopic(text);

  return {
    intent,
    secondaryIntents,
    topic,
    sentiment,
    questionType: question.questionType,
    isQuestion: question.isQuestion,
    negation,
    intensity: inferIntensity(text, sentiment),
    entities: extractEntities(text),
    matchedConcepts: concepts,
    confidence,
  };
}
