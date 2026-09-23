import type { CharacterDecision, ResponsePlan } from "../../cognition/cognition-types";
import type { CharacterInitiative } from "../../initiative/initiative-types";
import type { EmotionalState } from "../../emotions/emotion-types";
import type { RelationshipState } from "../../relationship/relationship-types";

export function initiativeSemanticBridge(
  initiative: CharacterInitiative,
  emotion: EmotionalState,
  relationship: RelationshipState,
): { decision: CharacterDecision; responsePlan: ResponsePlan } {
  const warm = relationship.closeness > 0.5 || emotion.affection > 0.58;
  const decision: CharacterDecision = {
    action: initiative.kind === "suggest_activity" ? "initiate_activity" : "acknowledge",
    tone: warm ? "warm_natural" : "natural",
    rationale: initiative.reason,
    confidence: Math.max(0.65, initiative.priority),
    shouldAskFollowUp: initiative.kind === "suggest_activity" || initiative.kind === "ask_about_user",
    shouldReferenceMemory: initiative.kind === "continue_thread",
    content: {
      mode: initiative.kind === "suggest_activity" ? "activity" : "social",
      stance: "neutral",
      summary: initiative.reason,
      reasons: [initiative.reason],
      locked: false,
      provenance: ["local_policy"],
    },
  };
  const responsePlan: ResponsePlan = {
    intent: decision.action,
    tone: decision.tone,
    length: "short",
    warmth: warm ? 0.76 : 0.52,
    directness: 0.62,
    emotionVisibility: warm ? "open" : "subtle",
    memoryReference: initiative.kind === "continue_thread" ? "explicit" : "none",
    questionMode: decision.shouldAskFollowUp ? "optional" : "none",
    initiative: "high",
    visualCue: warm ? "warm" : "curious",
    constraints: ["Keep initiative low-pressure and consistent with the selected initiative kind."],
  };
  return { decision, responsePlan };
}
