/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import { analyzeLocalNLU, classifyTopic, normalizeDialogueForMatching } from "./nlu";
import type { DialogueFrame, DialogueHistoryLine, LocalNLUResult } from "./types";

// ---- dialogue-frame.ts ----
function isQuestion(text: string) {
  return /\?\s*$/u.test(text.trim());
}

export function buildDialogueFrame(
  history: readonly DialogueHistoryLine[],
  current: LocalNLUResult,
): DialogueFrame {
  const recent = history.slice(-10);
  const userLines = recent.filter((line) => line.role === "user");
  const characterLines = recent.filter((line) => line.role === "character");
  const previousUser = userLines.at(-1);
  const lastCharacter = characterLines.at(-1);
  const previousNLU = previousUser ? analyzeLocalNLU(previousUser.text) : undefined;
  const previousTopic = previousNLU?.topic ?? (previousUser ? classifyTopic(previousUser.text) : undefined);
  const currentTopic = current.topic ?? previousTopic;
  let turnsOnTopic = currentTopic ? 1 : 0;

  if (currentTopic) {
    for (const line of [...recent].reverse()) {
      const topic = classifyTopic(line.text);
      if (!topic) continue;
      if (topic !== currentTopic) break;
      turnsOnTopic += 1;
    }
  }

  return {
    currentTopic,
    previousTopic,
    lastUserIntent: previousNLU?.intent,
    lastCharacterIntent: lastCharacter?.dialogueActs?.[0],
    pendingQuestion: lastCharacter && isQuestion(lastCharacter.text) ? lastCharacter.text : undefined,
    referencedEntities: current.entities.map((entity) => entity.normalized).slice(0, 8),
    turnsOnTopic: Math.min(turnsOnTopic, 20),
    previousUserText: previousUser?.text,
    previousCharacterText: lastCharacter?.text,
  };
}

// ---- topic-continuity.ts ----
const CONTEXTUAL_INTENTS = new Set([
  "ask_why",
  "ask_followup",
  "clarification_request",
  "reference_previous_topic",
  "short_yes",
  "short_no",
  "acknowledgement",
  "agreement",
  "disagreement",
  "uncertain",
  "user_dont_want",
]);

const GENERIC_TOPICS = new Set(["conversation", "plans"]);

export function resolveContinuityTopic(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
): string | undefined {
  if (nlu.topic && !GENERIC_TOPICS.has(nlu.topic)) return nlu.topic;
  if (CONTEXTUAL_INTENTS.has(nlu.intent))
    return frame.previousTopic ?? frame.currentTopic ?? nlu.topic;
  return nlu.topic;
}

// ---- reference-resolver.ts ----
const CONTEXTUAL = new Set([
  "ask_why",
  "ask_followup",
  "clarification_request",
  "reference_previous_topic",
  "short_yes",
  "short_no",
  "acknowledgement",
  "agreement",
  "disagreement",
  "uncertain",
  "user_dont_want",
]);

const USER_STATE_INTENTS = new Set([
  "user_tired",
  "user_sad",
  "user_angry",
  "user_bored",
  "user_excited",
  "user_happy",
  "user_lonely",
  "user_stressed",
  "user_sleepy",
]);

const DEICTIC_CONTINUATION_RE = /^(?:(?:а|и|ну)\s+)?(?:это|там|туда|оттуда|тогда|так|с этим|про это|об этом|он|она|они|его|ее|её|их)(?:\s|$)/u;

export function hasResolvableReference(nlu: LocalNLUResult, frame: DialogueFrame) {
  if (!CONTEXTUAL.has(nlu.intent)) return true;
  return Boolean(
    frame.currentTopic ||
    frame.previousTopic ||
    frame.pendingQuestion ||
    frame.previousUserText ||
    frame.previousCharacterText
  );
}

function resolveReciprocalQuestion(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText || !["ask_followup", "unknown", "statement"].includes(nlu.intent)) return nlu;
  const normalized = normalizeDialogueForMatching(currentText);
  if (!/^(?:а\s+)?(?:ты|тебе|у тебя|сама|сам)(?:\s+как)?[?.! ]*$/u.test(normalized)) return nlu;
  const previous = frame.lastUserIntent;
  if (previous && USER_STATE_INTENTS.has(previous)) {
    return {
      ...nlu,
      intent: "ask_character_state",
      topic: "character",
      isQuestion: true,
      questionType: "how",
      confidence: Math.max(nlu.confidence, 0.9),
    };
  }
  if (previous === "user_like" || previous === "user_dislike") {
    return {
      ...nlu,
      intent: "ask_character_preference",
      topic: "character",
      isQuestion: true,
      questionType: "what",
      confidence: Math.max(nlu.confidence, 0.86),
    };
  }
  if (previous === "share_work" || previous === "share_plan") {
    return {
      ...nlu,
      intent: "ask_character_activity",
      topic: "character",
      isQuestion: true,
      questionType: "what",
      confidence: Math.max(nlu.confidence, 0.84),
    };
  }
  return nlu;
}

function resolveDeicticContinuation(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText) return nlu;
  const normalized = normalizeDialogueForMatching(currentText);
  const tokenCount = normalized.split(/\s+/u).filter(Boolean).length;
  if (tokenCount > 10 || !DEICTIC_CONTINUATION_RE.test(normalized)) return nlu;
  const topic = frame.previousTopic ?? frame.currentTopic;
  if (!topic && !frame.previousUserText && !frame.previousCharacterText) return nlu;
  return {
    ...nlu,
    intent: ["statement", "unknown"].includes(nlu.intent) ? "reference_previous_topic" : nlu.intent,
    topic: topic ?? nlu.topic ?? "conversation",
    confidence: Math.max(nlu.confidence, 0.68),
  };
}


function resolvePendingQuestionReply(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  if (!currentText || !frame.pendingQuestion) return nlu;
  const current = normalizeDialogueForMatching(currentText);
  const pending = normalizeDialogueForMatching(frame.pendingQuestion);
  const stateQuestion = /(?:как\s+ты|как\s+дела|как\s+себя|настроен|самочувств|чувствуешь)/u.test(pending);
  if (!stateQuestion) return nlu;

  if (/^(?:плохо|так\s+себе|такое\s+себе|не\s+очень|хреновато|паршиво)[.! ]*$/u.test(current)) {
    return {
      ...nlu,
      intent: "user_sad",
      topic: "wellbeing",
      sentiment: "negative",
      confidence: Math.max(nlu.confidence, 0.9),
    };
  }
  if (/^(?:нормально|норм|вроде\s+норм|все\s+нормально|всё\s+нормально)[.! ]*$/u.test(current)) {
    return {
      ...nlu,
      intent: "acknowledgement",
      topic: "wellbeing",
      sentiment: "neutral",
      confidence: Math.max(nlu.confidence, 0.86),
    };
  }
  return nlu;
}

export function resolveContextualNLU(
  nlu: LocalNLUResult,
  frame: DialogueFrame,
  currentText?: string,
): LocalNLUResult {
  const pendingReply = resolvePendingQuestionReply(nlu, frame, currentText);
  const reciprocal = resolveReciprocalQuestion(pendingReply, frame, currentText);
  const contextual = resolveDeicticContinuation(reciprocal, frame, currentText);
  if (!CONTEXTUAL.has(contextual.intent)) return contextual;
  const resolved = hasResolvableReference(contextual, frame);
  return {
    ...contextual,
    topic: resolveContinuityTopic(contextual, frame),
    confidence: resolved
      ? Math.max(contextual.confidence, 0.72)
      : Math.min(contextual.confidence, 0.38),
  };
}
