import { reportRussianLanguagePackIssues } from "./language-pack";
import { analyzeLocalNLU } from "./nlu";
import { applyLocalNLUToPerception } from "./nlu";
import { buildDialogueContext } from "./planner";
import { initiativeSemanticBridge } from "./planner";
import { buildDialogueFrame } from "./continuity";
import { resolveContextualNLU } from "./continuity";
import { planAutonomousDialogue, planLocalDialogue, planSpontaneousBeat } from "./planner";
import { LocalDialogueRenderer } from "./renderer";
import { logLocalDialogueTrace } from "./core";

reportRussianLanguagePackIssues();

export const localDialogueRenderer = new LocalDialogueRenderer();
export { analyzeLocalNLU, applyLocalNLUToPerception, buildDialogueContext, buildDialogueFrame, resolveContextualNLU, initiativeSemanticBridge, planAutonomousDialogue, planLocalDialogue, planSpontaneousBeat, logLocalDialogueTrace };
export type * from "./types";
