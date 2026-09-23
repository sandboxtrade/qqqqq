/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { CharacterDecision, ResponsePlan } from "../cognition/cognition-types";

// ---- local-response.ts ----
export function localFallbackReply(
  userText: string,
  decision: CharacterDecision,
  plan: ResponsePlan,
): string {
  if (decision.action === "stay_silent") return "";
  if (decision.content.fallbackText !== undefined)
    return decision.content.fallbackText;
  if (decision.action === "refuse")
    return "Нет. На это я не соглашусь.";
  if (decision.action === "agree")
    return "Да, тут я с тобой согласна.";
  if (decision.action === "disagree")
    return "Нет, я бы с этим не согласилась.";
  if (decision.action === "challenge")
    return "Не обязательно. Я бы сначала разобралась, согласна ли я сама, а не просто подтвердила твою мысль.";
  if (decision.action === "set_boundary")
    return "Мне не нравится такой тон. Я могу продолжить разговор, но не буду делать вид, что меня это не задело.";
  if (decision.action === "show_irritation")
    return "Да, меня это задело. Делать вид, что мне всё равно, не хочу.";
  if (decision.action === "show_affection")
    return "Мне приятно это слышать. Правда.";
  if (decision.action === "change_topic")
    return "Хорошо, сменим тему.";
  if (decision.action === "ask")
    return "Уточни, пожалуйста, что именно ты имеешь в виду?";
  if (decision.action === "acknowledge" && plan.tone === "respectful")
    return "Хорошо. Я это услышала и не буду давить.";
  if (decision.action === "acknowledge")
    return "Я услышала тебя. Не хочу сейчас сводить это к дежурному совету.";
  if (decision.action === "joke") return "Ладно, это было неплохо. Засчитано.";
  if (decision.action === "initiate_activity")
    return "Мне нравится идея. Давай выберем, что именно будем делать.";
  if (decision.tone === "restrained")
    return "Я тебя услышала. Но сейчас я бы не стала делать вид, что всё нормально.";
  if (userText.includes("?"))
    return "Расскажи чуть подробнее, что ты имеешь в виду?";
  return "Я тебя слушаю.";
}

// ---- response-guard.ts ----
const FORBIDDEN_INTERNAL_RE =
  /(?:локальн(?:ый|ого) движок|языков(?:ый|ого) слой|system prompt|системн(?:ый|ого) промпт|chain.?of.?thought|скрыт(?:ые|ый) мысли|internal analysis|engine state)/iu;

const ACTION_PATTERNS: Partial<Record<CharacterDecision["action"], RegExp>> = {
  refuse: /(?:^|[^\p{L}\p{N}_])(?:нет|не буду|не стану|не хочу|не могу|откаж|no\b|won'?t|will not|can'?t|refuse)/iu,
  agree: /(?:соглас|да(?:[,.!\s]|$)|думаю так же|agree|yes(?:[,.!\s]|$)|same)/iu,
  disagree: /(?:не соглас|нет(?:[,.!\s]|$)|я бы не|не думаю|иначе|disagree|don'?t agree|do not agree|see it differently)/iu,
  challenge: /(?:не обязательно|не хочу соглаш|сначала .*сама|мо[её] мнение|not necessarily|won'?t just agree|my own opinion)/iu,
  set_boundary: /(?:не нравится|такой тон|не буду|границ|не нормально|not okay|don'?t speak|won'?t)/iu,
  show_irritation: /(?:задел|неприят|раздраж|бесит|annoy|bother|upset)/iu,
  change_topic: /(?:смен|друг(?:ую|ой) тем|о другом|change .*topic|something else)/iu,
  ask: /\?/u,
};


const COMPLIANCE_RE =
  /(?:нет проблем|без проблем|конечно(?:[,! ]+)?(?:я )?(?:сделаю|буду)|хорошо(?:[,! ]+)?(?:я )?(?:сделаю|буду)|я буду делать|буду делать как|как ты сказал|как скажешь|no problem|of course(?:[,! ]+)?(?:i )?(?:will|will do)|sure(?:[,! ]+)?(?:i )?(?:will|will do)|i'?ll do|i will do|as you said)/iu;
const CLEAR_DISAGREEMENT_RE =
  /(?:не соглас(?:на|ен)?|я бы не соглас|не думаю,? что это так|это не так|disagree|don'?t agree|do not agree|see it differently)/iu;
const CLEAR_AGREEMENT_RE =
  /(?:я соглас(?:на|ен)?|полностью соглас(?:на|ен)?|это верно|именно так|i agree|exactly|that'?s right)/iu;
const EXPLICIT_REFUSAL_RE =
  /(?:не буду|не стану|отказываюсь|не могу это сделать|won'?t|will not|refuse|can'?t do that)/iu;
const BOUNDARY_REVERSAL_RE =
  /(?:все нормально|всё нормально|можешь так говорить|говори так|меня это устраивает|это нормально для меня|it'?s okay|that'?s fine|keep talking like that)/iu;

function contradictsDecision(text: string, decision: CharacterDecision) {
  const lower = text.toLowerCase();
  if (decision.action === "refuse" || decision.content.stance === "refuse")
    return COMPLIANCE_RE.test(lower) && !EXPLICIT_REFUSAL_RE.test(lower);
  if (decision.action === "agree" || decision.content.stance === "agree")
    return CLEAR_DISAGREEMENT_RE.test(lower);
  if (decision.action === "disagree" || decision.content.stance === "disagree") {
    const withoutNegatedAgreement = lower.replace(/не\s+соглас(?:на|ен)?/giu, "");
    return CLEAR_AGREEMENT_RE.test(withoutNegatedAgreement);
  }
  if (decision.action === "set_boundary" || decision.content.mode === "boundary")
    return BOUNDARY_REVERSAL_RE.test(lower);
  return false;
}

const MAX_CHARS: Record<ResponsePlan["length"], number> = {
  very_short: 180,
  short: 420,
  balanced: 900,
  long: 1700,
};

function normalize(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function containsValidationKeyword(
  text: string,
  keywords: string[] | undefined,
) {
  if (!keywords?.length) return true;
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}


function contradictsLockedPreference(
  text: string,
  keywords: string[] | undefined,
) {
  if (!keywords?.length) return false;
  const lower = text.toLowerCase();
  const negation =
    /(?:не люблю|ненавиж|не нравится|не хочу|терпеть не могу|don'?t like|do not like|hate|don'?t want|do not want)/iu;
  return keywords.some((keyword) => {
    const index = lower.indexOf(keyword.toLowerCase());
    if (index < 0) return false;
    return negation.test(lower.slice(Math.max(0, index - 32), index + keyword.length));
  });
}

function trimAtBoundary(text: string, max: number) {
  if (text.length <= max) return text;
  const slice = text.slice(0, max + 1);
  const candidates = [
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("\n"),
  ];
  const boundary = Math.max(...candidates);
  if (boundary >= Math.floor(max * 0.55)) return slice.slice(0, boundary + 1).trim();
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export interface GuardedReply {
  text: string;
  usedFallback: boolean;
  reason?: string;
}

export function guardCharacterReply(
  generated: string,
  userText: string,
  decision: CharacterDecision,
  plan: ResponsePlan,
): GuardedReply {
  if (decision.action === "stay_silent")
    return { text: "", usedFallback: false };

  const text = normalize(generated);
  const fallback = (reason: string): GuardedReply => ({
    text: localFallbackReply(userText, decision, plan),
    usedFallback: true,
    reason,
  });

  if (!text) return fallback("empty");
  if (FORBIDDEN_INTERNAL_RE.test(text)) return fallback("internal-state-leak");
  if (contradictsDecision(text, decision))
    return fallback(`semantic-contradiction:${decision.action}`);

  const actionPattern = ACTION_PATTERNS[decision.action];
  if (actionPattern && !actionPattern.test(text))
    return fallback(`action-mismatch:${decision.action}`);

  if (
    decision.content.locked &&
    !containsValidationKeyword(text, decision.content.validationKeywords)
  )
    return fallback("locked-content-mismatch");

  if (
    decision.content.locked &&
    decision.content.mode === "personal_preference" &&
    contradictsLockedPreference(text, decision.content.validationKeywords)
  )
    return fallback("locked-content-contradiction");

  if (
    decision.content.forbiddenClaims?.some((claim) =>
      text.toLowerCase().includes(claim.toLowerCase()),
    )
  )
    return fallback("forbidden-claim");

  return {
    text: trimAtBoundary(text, MAX_CHARS[plan.length]),
    usedFallback: false,
  };
}
