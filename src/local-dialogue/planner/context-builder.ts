import type { CharacterCore } from "../../character/character-types";
import type { CharacterDecision, Perception, ResponsePlan } from "../../cognition/cognition-types";
import type { EmotionalState } from "../../emotions/emotion-types";
import type { CharacterInitiative } from "../../initiative/initiative-types";
import type { MemoryContext } from "../../memory/memory-types";
import type { RelationshipState } from "../../relationship/relationship-types";
import type { RomanceState } from "../../relationship/romance";
import type { WorldState } from "../../world/world-types";
import { buildDialogueFrame } from "../continuity/dialogue-frame";
import type { DialogueContext, DialogueHistoryLine, LocalNLUResult } from "../types";

export interface DialogueContextInput {
  userText?: string;
  turnId: string;
  now: number;
  character: CharacterCore;
  emotion: EmotionalState;
  relationship: RelationshipState;
  world: WorldState;
  romance?: RomanceState;
  memoryContext: MemoryContext;
  history: DialogueHistoryLine[];
  nlu: LocalNLUResult;
  perception: Perception;
  decision: CharacterDecision;
  responsePlan: ResponsePlan;
  initiative?: CharacterInitiative;
}

export function buildDialogueContext(input: DialogueContextInput): DialogueContext {
  return {
    ...input,
    history: input.history.slice(-24),
    dialogueFrame: buildDialogueFrame(input.history, input.nlu),
  };
}
