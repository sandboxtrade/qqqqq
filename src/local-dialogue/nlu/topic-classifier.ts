import { russianLanguagePack } from "../language-pack";
import { normalizeDialogueText } from "./normalize";
import { tokenizeDialogue, tokenStem } from "./tokenize";

export function classifyTopic(text: string): string | undefined {
  const normalized = normalizeDialogueText(text);
  const tokens = tokenizeDialogue(text);
  const stems = new Set(tokens.map(tokenStem));
  let best: { id: string; score: number } | undefined;
  for (const [id, definition] of Object.entries(russianLanguagePack.topics)) {
    let score = 0;
    for (const phrase of definition.phrases) if (normalized.includes(normalizeDialogueText(phrase))) score += 3;
    for (const token of definition.tokens) {
      const stem = tokenStem(normalizeDialogueText(token));
      if (stems.has(stem) || tokens.includes(normalizeDialogueText(token))) score += 1;
    }
    if (score > (best?.score ?? 0)) best = { id, score };
  }
  return best && best.score > 0 ? best.id : undefined;
}
