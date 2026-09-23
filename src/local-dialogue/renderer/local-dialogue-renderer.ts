import { russianLanguagePack } from "../language-pack";
import { fallbackKey } from "../planner/fallback-planner";
import { SeededRandom } from "../random/seeded-random";
import { maximumRecentSimilarity } from "../repetition/repetition-score";
import { recentCharacterResponses } from "../repetition/response-history";
import type { CharacterResponsePlan, DialogueContext, RenderedResponse, ResponseRenderer } from "../types";
import { composeFromActs } from "./phrase-composer";
import { isSafeRenderedText, openingPhrase, postProcessDialogue } from "./post-process";
import { selectTemplateCandidates } from "./template-selector";
import { chooseVariant } from "./variation-selector";

function chooseFallback(plan: CharacterResponsePlan, context: DialogueContext) {
  const key = fallbackKey(plan, context);
  const variants = russianLanguagePack.fallbacks[key] ?? russianLanguagePack.fallbacks.generic ?? ["Я тебя слушаю."];
  const rng = new SeededRandom(`${context.turnId}|fallback|${key}`);
  return { key, text: variants[rng.int(variants.length)] ?? "Я тебя слушаю." };
}

function authoritative(plan: CharacterResponsePlan) {
  const direct = plan.semanticPayload?.authoritativeText;
  if (typeof direct === "string") return { id: "semantic.authoritative", text: direct };
  const locked = plan.semanticPayload?.lockedText;
  if (plan.decision.content.locked && typeof locked === "string" && locked.trim()) return { id: "decision.locked", text: locked };
  return null;
}

export class LocalDialogueRenderer implements ResponseRenderer {
  async render(plan: CharacterResponsePlan, context: DialogueContext): Promise<RenderedResponse> {
    try {
      return this.renderInternal(plan, context);
    } catch (error) {
      if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
        console.error("[Yuzuki Local Dialogue] renderer fallback", error);
      const fallback = "Я тебя слушаю.";
      return this.result(fallback, "fallback:renderer-error", 5, 0, plan, context, []);
    }
  }

  private renderInternal(plan: CharacterResponsePlan, context: DialogueContext): RenderedResponse {
    if (plan.dialogueActs.includes("SILENCE") || plan.decision.action === "stay_silent")
      return this.result("", "silence", 0, 0, plan, context, []);

    const direct = authoritative(plan);
    if (direct) {
      const text = postProcessDialogue(direct.text);
      if (text && isSafeRenderedText(text)) return this.result(text, direct.id, 0, maximumRecentSimilarity(text, recentCharacterResponses(context.history)), plan, context, []);
    }

    const { accepted, rejected } = selectTemplateCandidates(plan, context);
    const withoutCooldown = accepted.filter((candidate) => !candidate.coolingDown);
    const templatePool = withoutCooldown.length ? withoutCooldown : accepted;
    const recent = recentCharacterResponses(context.history, 16);
    const renderedCandidates = templatePool.flatMap((candidate) => {
      const choice = chooseVariant(candidate.template.variants, candidate.template.id, plan, context);
      if (!choice) return [];
      return [{ ...candidate, choice }];
    });

    if (renderedCandidates.length) {
      const bestLevel = Math.min(...renderedCandidates.map((candidate) => candidate.level));
      const levelPool = renderedCandidates.filter((candidate) => candidate.level === bestLevel);
      const bestSimilarity = Math.min(...levelPool.map((candidate) => candidate.choice.similarity));
      const similarityFiltered = levelPool.filter(
        (candidate) => candidate.choice.similarity <= Math.min(0.86, bestSimilarity + 0.12),
      );
      // When every remaining variant is necessarily similar (for example the
      // user sends the same sentence many times), never let anti-repetition
      // turn an otherwise valid response into a renderer failure. Keep the
      // least-similar candidates and let the cooldown/seeded selector choose
      // among them.
      const similarityPool = similarityFiltered.length
        ? similarityFiltered
        : levelPool.filter((candidate) => candidate.choice.similarity === bestSimilarity);
      const rng = new SeededRandom(`${context.turnId}|template|${plan.sourceIntent}`);
      const weighted = similarityPool.flatMap((candidate) => Array.from({ length: Math.max(1, Math.min(6, Math.round(candidate.template.weight * 2))) }, () => candidate));
      const selected = weighted[rng.int(weighted.length)] ?? similarityPool[0];
      const text = postProcessDialogue(selected.choice.text);
      if (text && isSafeRenderedText(text)) return this.result(text, selected.template.id, selected.level, selected.choice.similarity, plan, context, rejected);
    }

    const composed = composeFromActs(plan, context);
    if (composed) {
      const text = postProcessDialogue(composed.text);
      if (text && isSafeRenderedText(text)) return this.result(text, `composed:${composed.ids.join("+")}`, 3, composed.similarity, plan, context, rejected);
    }

    const fallback = chooseFallback(plan, context);
    const fallbackText = postProcessDialogue(fallback.text);
    const safe = isSafeRenderedText(fallbackText) ? fallbackText : "Я тебя слушаю.";
    return this.result(safe, `fallback:${fallback.key}`, 5, maximumRecentSimilarity(safe, recent), plan, context, rejected);
  }

  private result(
    text: string,
    templateId: string,
    fallbackLevel: number,
    similarityScore: number,
    plan: CharacterResponsePlan,
    context: DialogueContext,
    rejectedTemplates: Array<{ id: string; reason: string }>,
  ): RenderedResponse {
    return {
      text,
      templateId,
      openingPhrase: openingPhrase(text),
      dialogueActs: plan.dialogueActs,
      fallbackLevel,
      debug: {
        detectedIntent: context.nlu.intent,
        confidence: context.nlu.confidence,
        concepts: context.nlu.matchedConcepts,
        selectedActs: plan.dialogueActs,
        selectedTemplate: templateId,
        rejectedTemplates,
        relationshipBand: context.relationship.stage,
        emotion: plan.emotion,
        fallbackLevel,
        similarityScore,
        languagePackIssues: russianLanguagePack.issues,
      },
    };
  }
}
