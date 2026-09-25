import { reportRussianLanguagePackIssues } from "./language-pack";
import { analyzeLocalNLU, applyLocalNLUToPerception, detectLocalAppearanceRequest } from "./nlu";
import { buildDialogueContext } from "./planner";
import { initiativeSemanticBridge } from "./planner";
import { buildDialogueFrame, buildRetrospectiveContext, applyRetrospectiveNLU, buildCausalRelations, extractCausalRelations, resolveContextualNLU, shouldUseRetrospectivePass } from "./continuity";
import { planAutonomousDialogue, planLocalDialogue, planSpontaneousBeat } from "./planner";
import { LocalDialogueRenderer } from "./renderer";
import { logLocalDialogueTrace } from "./core";

reportRussianLanguagePackIssues();

export const localDialogueRenderer = new LocalDialogueRenderer();
export { analyzeLocalNLU, applyLocalNLUToPerception, detectLocalAppearanceRequest, buildDialogueContext, buildDialogueFrame, buildRetrospectiveContext, applyRetrospectiveNLU, buildCausalRelations, extractCausalRelations, resolveContextualNLU, shouldUseRetrospectivePass, initiativeSemanticBridge, planAutonomousDialogue, planLocalDialogue, planSpontaneousBeat, logLocalDialogueTrace };
export type * from "./types";
