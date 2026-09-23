import { russianLanguagePack } from "../language-pack";
import { templateOnCooldown } from "../repetition/cooldown";
import { SeededRandom } from "../random/seeded-random";
import type { CharacterResponsePlan, DialogueAct, DialogueContext, ReactionFragment } from "../types";
import { chooseVariant } from "./variation-selector";

function matches(fragment: ReactionFragment, act: DialogueAct, plan: CharacterResponsePlan, context: DialogueContext) {
  if (fragment.act !== act) return false;
  if (fragment.intents?.length && !fragment.intents.includes(plan.sourceIntent)) return false;
  if (fragment.tones?.length && !fragment.tones.some((tone) => plan.tone.includes(tone))) return false;
  if (fragment.relationship?.length && !fragment.relationship.includes(context.relationship.stage)) return false;
  if (fragment.conceptsAny?.length && !fragment.conceptsAny.some((concept) => context.nlu.matchedConcepts.includes(concept))) return false;
  return true;
}

function specificity(fragment: ReactionFragment) {
  return (fragment.intents?.length ? 4 : 0) + (fragment.tones?.length ? 2 : 0) + (fragment.relationship?.length ? 2 : 0) + (fragment.conceptsAny?.length ? 2 : 0);
}

function actLimit(plan: CharacterResponsePlan) {
  switch (plan.responseLength) {
    case "very_short": return 1;
    case "short": return 2;
    case "medium": return 3;
    case "long": return 4;
  }
}

function pickFragment(act: DialogueAct, plan: CharacterResponsePlan, context: DialogueContext) {
  const candidates = russianLanguagePack.reactions
    .filter((fragment) => matches(fragment, act, plan, context))
    .sort((a, b) => specificity(b) - specificity(a) || Number(templateOnCooldown(a.id, a.cooldownTurns, context.history)) - Number(templateOnCooldown(b.id, b.cooldownTurns, context.history)) || b.weight - a.weight || a.id.localeCompare(b.id));
  if (!candidates.length) return null;
  const bestSpecificity = specificity(candidates[0]);
  let pool = candidates.filter((entry) => specificity(entry) === bestSpecificity && !templateOnCooldown(entry.id, entry.cooldownTurns, context.history));
  if (!pool.length) pool = candidates.filter((entry) => specificity(entry) === bestSpecificity);
  const rng = new SeededRandom(`${context.turnId}|fragment|${act}|${plan.sourceIntent}`);
  const fragment = pool[rng.int(pool.length)] ?? candidates[0];
  const choice = chooseVariant(fragment.variants, fragment.id, plan, context);
  return choice ? { id: fragment.id, ...choice } : null;
}

export function composeFromActs(plan: CharacterResponsePlan, context: DialogueContext) {
  if (plan.dialogueActs.includes("SILENCE")) return { text: "", ids: ["act.silence"], similarity: 0 };
  const selected: Array<{ id: string; text: string; similarity: number }> = [];
  const max = actLimit(plan);
  for (const act of plan.dialogueActs) {
    if (selected.length >= max) break;
    if (act === "FOLLOW_UP" && !plan.shouldAskQuestion) continue;
    const fragment = pickFragment(act, plan, context);
    if (fragment) selected.push(fragment);
  }
  if (!selected.length) return null;
  return {
    text: selected.map((entry) => entry.text).join(" "),
    ids: selected.map((entry) => entry.id),
    similarity: Math.max(...selected.map((entry) => entry.similarity)),
  };
}
