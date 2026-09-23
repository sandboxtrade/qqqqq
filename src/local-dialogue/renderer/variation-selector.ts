import { SeededRandom } from "../random/seeded-random";
import { maximumRecentSimilarity } from "../repetition/repetition-score";
import { recentCharacterResponses } from "../repetition/response-history";
import type { CharacterResponsePlan, DialogueContext } from "../types";
import { resolveSlots } from "./slot-resolver";

export interface VariantChoice {
  text: string;
  similarity: number;
}

export function chooseVariant(
  variants: readonly string[],
  seedNamespace: string,
  plan: CharacterResponsePlan,
  context: DialogueContext,
): VariantChoice | null {
  const recent = recentCharacterResponses(context.history, 16);
  const candidates = variants.flatMap((variant) => {
    const text = resolveSlots(variant, plan, context);
    if (!text) return [];
    return [{ text, similarity: maximumRecentSimilarity(text, recent) }];
  });
  if (!candidates.length) return null;
  const lastResponse = recent.at(-1);
  const withoutImmediateRepeat = lastResponse
    ? candidates.filter((candidate) => candidate.text !== lastResponse)
    : candidates;
  const basePool = withoutImmediateRepeat.length ? withoutImmediateRepeat : candidates;
  const lowest = Math.min(...basePool.map((candidate) => candidate.similarity));
  const similarityFiltered = basePool.filter(
    (candidate) => candidate.similarity <= Math.min(0.86, lowest + 0.13),
  );
  const pool = similarityFiltered.length
    ? similarityFiltered
    : basePool.filter((candidate) => candidate.similarity === lowest);
  const rng = new SeededRandom(`${context.turnId}|${seedNamespace}|${plan.sourceIntent}`);
  return pool[rng.int(pool.length)] ?? basePool[0] ?? candidates[0];
}
