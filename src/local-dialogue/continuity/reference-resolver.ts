import type { DialogueFrame, LocalNLUResult } from "../types";
import { resolveContinuityTopic } from "./topic-continuity";

const CONTEXTUAL = new Set(["ask_why", "ask_followup", "reference_previous_topic", "short_yes", "short_no", "user_dont_want"]);

export function hasResolvableReference(nlu: LocalNLUResult, frame: DialogueFrame) {
  if (!CONTEXTUAL.has(nlu.intent)) return true;
  return Boolean(frame.currentTopic || frame.previousTopic || frame.pendingQuestion || frame.previousUserText || frame.previousCharacterText);
}

export function resolveContextualNLU(nlu: LocalNLUResult, frame: DialogueFrame): LocalNLUResult {
  if (!CONTEXTUAL.has(nlu.intent)) return nlu;
  const resolved = hasResolvableReference(nlu, frame);
  return {
    ...nlu,
    topic: resolveContinuityTopic(nlu, frame),
    confidence: resolved ? Math.max(nlu.confidence, 0.7) : Math.min(nlu.confidence, 0.38),
  };
}
