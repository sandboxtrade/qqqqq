import type { DialogueFrame, DialogueHistoryLine, LocalNLUResult } from "../types";
import { analyzeLocalNLU } from "../nlu/nlu";
import { classifyTopic } from "../nlu/topic-classifier";

function isQuestion(text: string) {
  return /\?\s*$/u.test(text.trim());
}

export function buildDialogueFrame(
  history: readonly DialogueHistoryLine[],
  current: LocalNLUResult,
): DialogueFrame {
  const recent = history.slice(-10);
  const userLines = recent.filter((line) => line.role === "user");
  const characterLines = recent.filter((line) => line.role === "character");
  const previousUser = userLines.at(-1);
  const lastCharacter = characterLines.at(-1);
  const previousNLU = previousUser ? analyzeLocalNLU(previousUser.text) : undefined;
  const previousTopic = previousNLU?.topic ?? (previousUser ? classifyTopic(previousUser.text) : undefined);
  const currentTopic = current.topic ?? previousTopic;
  let turnsOnTopic = currentTopic ? 1 : 0;

  if (currentTopic) {
    for (const line of [...recent].reverse()) {
      const topic = classifyTopic(line.text);
      if (!topic) continue;
      if (topic !== currentTopic) break;
      turnsOnTopic += 1;
    }
  }

  return {
    currentTopic,
    previousTopic,
    lastUserIntent: previousNLU?.intent,
    lastCharacterIntent: lastCharacter?.dialogueActs?.[0],
    pendingQuestion: lastCharacter && isQuestion(lastCharacter.text) ? lastCharacter.text : undefined,
    referencedEntities: current.entities.map((entity) => entity.normalized).slice(0, 8),
    turnsOnTopic: Math.min(turnsOnTopic, 20),
    previousUserText: previousUser?.text,
    previousCharacterText: lastCharacter?.text,
  };
}
