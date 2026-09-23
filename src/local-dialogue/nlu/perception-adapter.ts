import type { Perception, PerceptionIntent, PerceptionTone } from "../../cognition/cognition-types";
import type { LocalNLUResult } from "../types";

const PROTECTED_BROAD = new Set<PerceptionIntent>(["boundary", "affection", "apology", "invitation", "request"]);

function broadIntent(nlu: LocalNLUResult): PerceptionIntent | undefined {
  if (["ask_character_state","ask_character_identity","ask_character_name","ask_character_age","ask_relationship","ask_character_opinion","ask_character_preference","ask_character_activity","ask_for_opinion","ask_why","ask_followup","memory_question","ask_user_memory","external_fact_question"].includes(nlu.intent)) return "question";
  if (["request_action","ask_for_support"].includes(nlu.intent)) return "request";
  if (["user_happy","user_sad","user_angry","user_tired","user_bored","user_excited","user_lonely","user_stressed","user_sleepy","share_good_event","share_bad_event","share_work","share_plan","share_problem"].includes(nlu.intent)) return "disclosure";
  if (["compliment_character","affection_declaration","flirt_character"].includes(nlu.intent)) return "affection";
  if (nlu.intent === "apology") return "apology";
  if (["disagreement","short_no","dislike_character"].includes(nlu.intent)) return "disagreement";
  if (nlu.intent === "invitation") return "invitation";
  if (["boundary_request","change_topic"].includes(nlu.intent)) return "boundary";
  if (nlu.intent === "unknown") return "unknown";
  return "statement";
}

function toneFromNLU(nlu: LocalNLUResult): PerceptionTone | undefined {
  if (nlu.intent === "insult_character" || nlu.intent === "user_angry") return "irritated";
  if (nlu.intent === "user_sad" || nlu.intent === "user_lonely") return "sad";
  if (nlu.intent === "user_stressed") return "anxious";
  if (["compliment_character","affection_declaration","thanks","user_happy","user_excited"].includes(nlu.intent)) return "warm";
  if (["tease_character","joke","flirt_character"].includes(nlu.intent)) return "playful";
  return undefined;
}

export function applyLocalNLUToPerception(base: Perception, nlu: LocalNLUResult): Perception {
  const inferred = broadIntent(nlu);
  const canOverride = !PROTECTED_BROAD.has(base.probableIntent) && nlu.confidence >= 0.62;
  const probableIntent = canOverride && inferred ? inferred : base.probableIntent;
  const tone = base.tone === "neutral" || base.tone === "unknown" ? toneFromNLU(nlu) ?? base.tone : base.tone;
  const vulnerability = Math.max(base.vulnerability, ["user_sad","user_lonely","user_stressed","share_problem","ask_for_support"].includes(nlu.intent) ? 0.74 : 0);
  return {
    ...base,
    probableIntent,
    tone,
    topics: [...new Set([...(nlu.topic ? [nlu.topic] : []), ...nlu.matchedConcepts, ...base.topics])].slice(0, 8),
    emotionalSignals: [...new Set([...base.emotionalSignals, ...nlu.matchedConcepts.filter((value) => ["tired","sad","angry","lonely","stressed","happy","excited"].includes(value))])].slice(0, 8),
    vulnerability,
    ambiguity: nlu.confidence < 0.45 ? Math.max(base.ambiguity, 0.72) : Math.min(base.ambiguity, 1 - nlu.confidence * 0.62),
    confidence: Math.max(base.confidence, nlu.confidence * 0.94),
    source: "local",
  };
}
