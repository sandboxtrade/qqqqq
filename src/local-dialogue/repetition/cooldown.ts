import type { DialogueHistoryLine } from "../types";

export function templateOnCooldown(
  templateId: string,
  cooldownTurns: number,
  history: readonly DialogueHistoryLine[],
) {
  if (cooldownTurns <= 0) return false;
  const characterTurns = history.filter((line) => line.role === "character").slice(-cooldownTurns);
  return characterTurns.some((line) => line.templateId === templateId || line.templateId?.includes(templateId));
}
