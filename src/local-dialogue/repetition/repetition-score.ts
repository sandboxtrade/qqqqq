import { normalizeDialogueText } from "../nlu/normalize";
import { tokenizeDialogue } from "../nlu/tokenize";

function ngrams(tokens: string[], size: number) {
  const values = new Set<string>();
  for (let index = 0; index <= tokens.length - size; index += 1)
    values.add(tokens.slice(index, index + size).join(" "));
  return values;
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

export function repetitionScore(left: string, right: string): number {
  const a = tokenizeDialogue(left);
  const b = tokenizeDialogue(right);
  if (!a.length || !b.length) return 0;
  const unigram = jaccard(new Set(a), new Set(b));
  const bigram = jaccard(ngrams(a, 2), ngrams(b, 2));
  const trigram = jaccard(ngrams(a, 3), ngrams(b, 3));
  const na = normalizeDialogueText(left);
  const nb = normalizeDialogueText(right);
  const prefix = na.slice(0, 24) === nb.slice(0, 24) && Math.min(na.length, nb.length) >= 24 ? 1 : 0;
  const suffix = na.slice(-22) === nb.slice(-22) && Math.min(na.length, nb.length) >= 22 ? 1 : 0;
  return Math.min(1, unigram * 0.36 + bigram * 0.32 + trigram * 0.22 + prefix * 0.06 + suffix * 0.04);
}

export function maximumRecentSimilarity(candidate: string, recent: readonly string[]) {
  return recent.reduce((best, previous) => Math.max(best, repetitionScore(candidate, previous)), 0);
}
