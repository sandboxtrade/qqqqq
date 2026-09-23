import type { CharacterResponsePlan, DialogueContext } from "../types";

export function fallbackKey(plan: CharacterResponsePlan, context: DialogueContext) {
  if (plan.sourceIntent === "external_fact_question") return "external_fact";
  if (["memory_question", "ask_user_memory"].includes(plan.sourceIntent) && !context.memoryContext.facts.length && !context.memoryContext.memories.length)
    return "no_memory";
  if (context.nlu.confidence < 0.45) return "low_confidence";
  if (plan.sourceIntent === "unknown") return "unknown";
  if (plan.trigger === "AUTONOMOUS_MESSAGE") return "autonomous";
  return "generic";
}
