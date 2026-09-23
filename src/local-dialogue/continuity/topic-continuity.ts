import type { DialogueFrame, LocalNLUResult } from "../types";

const CONTEXTUAL_INTENTS = new Set([
  "ask_why",
  "ask_followup",
  "reference_previous_topic",
  "short_yes",
  "short_no",
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
