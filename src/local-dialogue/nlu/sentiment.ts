import type { LocalSentiment } from "../types";
import { normalizeDialogueText } from "./normalize";

const VERY_NEGATIVE = /(?:ненавиж|ужас|кошмар|в бешенстве|пиздец|хуже некуда)/u;
const NEGATIVE = /(?:груст|устал|тревож|пережива|стресс|одинок|скучно|плохо|неприят|проблем|злюсь|бесит)/u;
const VERY_POSITIVE = /(?:обожаю|в восторге|счастлив|счастлива|лучший день|охуенно|невероятно рад|невероятно рада)/u;
const POSITIVE = /(?:рад|рада|круто|хорошо|спасибо|люблю|нравится|получилось|классно)/u;

export function detectSentiment(text: string, hinted?: LocalSentiment, negation = false): LocalSentiment {
  const normalized = normalizeDialogueText(text);
  if (VERY_NEGATIVE.test(normalized)) return negation ? "neutral" : "very_negative";
  if (VERY_POSITIVE.test(normalized)) return negation ? "neutral" : "very_positive";
  if (NEGATIVE.test(normalized)) return negation ? "neutral" : "negative";
  if (POSITIVE.test(normalized)) return negation ? "neutral" : "positive";
  return hinted ?? "neutral";
}
