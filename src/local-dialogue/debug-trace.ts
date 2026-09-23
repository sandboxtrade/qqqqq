import type { CharacterResponsePlan, LocalNLUResult, RenderedResponse } from "./types";

function isDevelopmentBuild() {
  return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
}

export function logLocalDialogueTrace(input: {
  userText?: string;
  nlu: LocalNLUResult;
  plan: CharacterResponsePlan;
  rendered: RenderedResponse;
}) {
  if (!isDevelopmentBuild()) return;
  console.debug("[Yuzuki Local Dialogue]", {
    userText: input.userText ?? "",
    nlu: input.nlu,
    characterPlan: {
      trigger: input.plan.trigger,
      sourceIntent: input.plan.sourceIntent,
      goal: input.plan.goal,
      dialogueActs: input.plan.dialogueActs,
      emotion: input.plan.emotion,
      tone: input.plan.tone,
      relationshipLevel: input.plan.relationshipLevel,
      responseLength: input.plan.responseLength,
      shouldAskQuestion: input.plan.shouldAskQuestion,
      topic: input.plan.topic,
    },
    selectedTemplate: input.rendered.templateId,
    finalResponse: input.rendered.text,
    fallbackLevel: input.rendered.fallbackLevel,
  });
}
