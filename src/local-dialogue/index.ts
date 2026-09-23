import { reportRussianLanguagePackIssues } from "./language-pack";
import { analyzeLocalNLU } from "./nlu/nlu";
import { applyLocalNLUToPerception } from "./nlu/perception-adapter";
import { buildDialogueContext } from "./planner/context-builder";
import { initiativeSemanticBridge } from "./planner/autonomy-adapter";
import { buildDialogueFrame } from "./continuity/dialogue-frame";
import { resolveContextualNLU } from "./continuity/reference-resolver";
import { planAutonomousDialogue, planLocalDialogue } from "./planner/dialogue-planner";
import { LocalDialogueRenderer } from "./renderer/local-dialogue-renderer";
import { logLocalDialogueTrace } from "./debug-trace";

reportRussianLanguagePackIssues();

export const localDialogueRenderer = new LocalDialogueRenderer();
export { analyzeLocalNLU, applyLocalNLUToPerception, buildDialogueContext, buildDialogueFrame, resolveContextualNLU, initiativeSemanticBridge, planAutonomousDialogue, planLocalDialogue, logLocalDialogueTrace };
export type * from "./types";
