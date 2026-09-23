import type { DialogueHistoryLine } from "../types";

export function recentCharacterResponses(history: readonly DialogueHistoryLine[], limit = 16) {
  return history
    .filter((line) => line.role === "character" && line.text.trim().length > 0)
    .slice(-Math.max(1, Math.min(limit, 40)))
    .map((line) => line.text);
}
