import { russianLanguagePack } from "../language-pack";
import { templateOnCooldown } from "../repetition/cooldown";
import type { CharacterResponsePlan, DialogueContext, DialogueTemplate, RejectedTemplate } from "../types";
import { hasRelevantMemory } from "./slot-resolver";

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
