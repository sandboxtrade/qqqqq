/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { Perception, PerceptionIntent, PerceptionTone } from "../cognition/cognition-types";
import { russianLanguagePack } from "./language-pack";
import type { ExtractedEntity, IntentDefinition, LocalNLUResult, LocalQuestionType, LocalSemanticFrame, LocalSentiment, SemanticStance, SemanticSubject } from "./types";

// ---- normalize.ts ----
const CHAT_TOKEN_ALIASES: Readonly<Record<string, string>> = {
  "че": "что",
  "чё": "что",
  "чо": "что",
  "шо": "что",
  "щас": "сейчас",
  "ща": "сейчас",
  "спс": "спасибо",
  "пасиба": "спасибо",
  "пасибки": "спасибо",
  "пжлст": "пожалуйста",
  "плиз": "пожалуйста",
  "прив": "привет",
  "даров": "здорово",
  "дарова": "здорово",
  "здарова": "здорово",
  "здрасьте": "здравствуйте",
  "нормас": "нормально",
  "норм": "нормально",
  "пон": "понял",
  "понятн": "понятно",
  "ясн": "ясно",
  "угу": "да",
  "ага": "да",
  "неа": "нет",
  "ок": "окей",
  "мб": "может быть",
  "хз": "не знаю",
  "типо": "типа",
  "скок": "сколько",
  "скока": "сколько",
  "поч": "почему",
  "крч": "короче",
  "тя": "тебя",
  "тебя": "тебя",
  "чёт": "что-то",
  "чет": "что-то",
  "чета": "что-то",
  "ваще": "вообще",
  "воще": "вообще",
  "капец": "капец",
  "ппц": "капец",
  "оч": "очень",
  "нз": "не знаю",
  "хзш": "не знаю",
  "лан": "ладно",
  "ладн": "ладно",
  "настроние": "настроение",
  "самочуствие": "самочувствие",
  "завут": "зовут",
  "занимаешся": "занимаешься",
  "делаеш": "делаешь",
};

function squashExpressiveToken(token: string) {
  let value = token.replace(/([\p{L}])\1{2,}/gu, "$1");
  if (/^да{2,}$/u.test(value)) value = "да";
  if (/^не+т+$/u.test(value)) value = "нет";
  if (/^ага{1,}а+$/u.test(value)) value = "ага";
  if (/^привет+$/u.test(value)) value = "привет";
  return value;
}

export function normalizeDialogueText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/gu, "е")
    .replace(/[«»„“”]/gu, '"')
    .replace(/[‐‑‒–—]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

/** More permissive normalization used only by local language matching. */
export function normalizeDialogueForMatching(value: string): string {
  return normalizeDialogueText(value)
    .replace(/[\p{L}]+/gu, (token) => {
      const squashed = squashExpressiveToken(token);
      return CHAT_TOKEN_ALIASES[squashed] ?? squashed;
    })
    .replace(/\s+/gu, " ")
    .trim();
}

// ---- entity-extractor.ts ----
function entity(type: ExtractedEntity["type"], value: string, confidence = 0.8): ExtractedEntity {
  return { type, value, normalized: normalizeDialogueText(value), confidence };
}

export function extractEntities(text: string): ExtractedEntity[] {
  const normalized = normalizeDialogueText(text);
  const result: ExtractedEntity[] = [];
  const numberMatches = normalized.match(/\b\d{1,6}(?:[.,]\d+)?\b/gu) ?? [];
  for (const value of numberMatches.slice(0, 4)) result.push(entity("number", value, 0.98));

  const timeMatch = normalized.match(/\b(?:сегодня|завтра|вчера|утром|вечером|ночью|днем|днём)\b/gu) ?? [];
  for (const value of timeMatch.slice(0, 3)) result.push(entity("time", value, 0.94));

  const workMatch = /(?:на работе|в офисе|на смене|работаю\s+(?:в|на)\s+([\p{L}\p{N}_ -]{2,30}))/u.exec(normalized);
  if (workMatch) result.push(entity("work", workMatch[1] ?? workMatch[0], 0.76));

  const personMatches = [...text.matchAll(/(?:с|про|о)\s+([А-ЯЁ][а-яё]{2,20})/gu)].slice(0, 3);
  for (const match of personMatches) result.push(entity("person", match[1], 0.68));

  return result;
}

// ---- tokenize.ts ----
export function tokenizeDialogue(value: string): string[] {
  return normalizeDialogueForMatching(value)
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.replace(/^-+|-+$/gu, ""))
    .filter(Boolean);
}

export function tokenStem(token: string): string {
  // Keep short conversational words intact. Aggressively stripping one-letter
  // endings made unrelated words such as "просто" and "прости" identical.
  if (token.length <= 5) return token;
  const longEnding = token.replace(
    /(?:иями|ями|ами|его|ого|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ый|ий|ой|ую|юю|ам|ям|ах|ях|ом|ем|ов|ев)$/u,
    "",
  );
  if (longEnding !== token) return longEnding;
  if (token.length >= 8) return token.replace(/(?:ы|и|а|я|у|ю|е|о)$/u, "");
  return token;
}

// ---- semantic-frame.ts ----
const SEMANTIC_STOP_WORDS = new Set([
  "а", "и", "но", "ну", "вот", "это", "эта", "этот", "эти", "то", "же", "бы", "ли", "просто",
  "как", "что", "чтобы", "когда", "где", "там", "тут", "здесь", "вообще", "короче", "типа", "прям",
  "я", "ты", "мы", "он", "она", "они", "мне", "тебе", "меня", "тебя", "у", "в", "на", "с", "к", "по",
  "про", "об", "о", "за", "из", "для", "от", "до", "не", "да", "нет", "уже", "еще", "ещё",
]);

function compactSemantic(value: string | undefined, max = 108) {
  if (!value) return undefined;
  const clean = normalizeDialogueForMatching(value)
    .replace(/^[,.:;!?\-\s]+|[,.:;!?\-\s]+$/gu, "")
    .replace(/^(?:ну|короче|слушай|смотри|в общем|вообще)\s*[,.:;-]?\s*/u, "")
    .trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function meaningfulTokenCount(text: string) {
  return tokenizeDialogue(text).filter((token) => token.length > 1 && /\p{L}/u.test(token) && !SEMANTIC_STOP_WORDS.has(token)).length;
}

function detectLocalIntimacySignal(normalized: string): LocalSemanticFrame["intimacy"] {
  const hasIntimateContext = /(?:интим|18\+|ближе|поцел|обним|прижм|ласк|возбуж|хочу\s+тебя|тянет\s+к\s+тебе|между\s+нами|нежн|флирт|дразн|сексуаль|страст)/u.test(normalized);
  const absoluteStop = /(?:^|\s)(?:стоп|хватит|прекрати|остановись)(?:\s|$|[,.!?])/u.test(normalized);
  const contextualStop = hasIntimateContext && /(?:^|\s)(?:не\s+хочу|не\s+надо|давай\s+не\s+будем|не\s+трогай|не\s+продолжай)(?:\s|$|[,.!?])/u.test(normalized);
  if (absoluteStop || contextualStop)
    return { kind: "stop", strength: 1, explicit: true, intimacyContext: contextualStop || hasIntimateContext };

  const pause = /(?:^|\s)(?:подожди|пауза|медленнее|не\s+спеши|давай\s+помедленнее|чуть\s+спокойнее|мне\s+нужно\s+время)(?:\s|$|[,.!?])/u.test(normalized);
  if (pause && (hasIntimateContext || normalized.split(/\s+/u).length <= 5))
    return { kind: "pause", strength: 0.94, explicit: true, intimacyContext: hasIntimateContext };

  const resume = /(?:можно\s+продолж(?:ить|ай)|давай\s+продолжим|продолжай|я\s+готов(?:а)?|все\s+нормально\s*[,.-]?\s*продолжай|всё\s+нормально\s*[,.-]?\s*продолжай)/u.test(normalized);
  if (resume) return { kind: "resume", strength: 0.88, explicit: true, intimacyContext: hasIntimateContext };

  const hesitant = /(?:не\s+уверен(?:а)?|не\s+знаю|мне\s+неловко|немного\s+страшно|может\s+не\s+сейчас|я\s+сомневаюсь)/u.test(normalized);
  if (hesitant && hasIntimateContext)
    return { kind: "hesitant", strength: 0.82, explicit: true, intimacyContext: true };

  // Aftercare needs explicit post-intimacy language here. Generic requests to
  // hug or stay nearby are resolved as aftercare by continuity only when the
  // previous turn was actually intimate.
  const aftercare = /(?:после\s+(?:этого|всего).*(?:побудь|обними|не\s+уходи|рядом)|(?:все|всё)\s+хорошо\s+между\s+нами|ты\s+в\s+порядке\s+после|как\s+ты\s+после)/u.test(normalized);
  if (aftercare) return { kind: "aftercare", strength: 0.76, explicit: true, intimacyContext: true };

  const consent = /(?:хочу\s+тебя|мне\s+это\s+нравится|да\s*[,.-]?\s*хочу(?:\s+тебя)?|хочу\s+продолжить\s+ближе)/u.test(normalized);
  if (consent) return { kind: "consent", strength: 0.9, explicit: true, intimacyContext: true };

  const approach = /(?:хочу\s+быть\s+ближе|давай\s+ближе|можешь\s+поцеловать|поцелуй\s+меня|обними\s+меня|хочу\s+быть\s+рядом|иди\s+сюда|сядь\s+ближе|подойди\s+ближе|можно\s+к\s+тебе\s+ближе|давай\s+поближе)/u.test(normalized);
  if (approach) return { kind: "approach", strength: 0.72, explicit: true, intimacyContext: true };

  const flirt = /(?:флиртуешь|флирт|дразнишь|подкатываешь|соблазн|сексуальн|горячая|горячий)/u.test(normalized);
  if (flirt) return { kind: "flirt", strength: 0.68, explicit: false, intimacyContext: true };
  const affection = /(?:обним|поцел|нежн|скучал|скучала|люблю\s+тебя|мне\s+хорошо\s+с\s+тобой)/u.test(normalized);
  if (affection) return { kind: "affection", strength: 0.58, explicit: false, intimacyContext: false };
  return { kind: "none", strength: 0, explicit: false, intimacyContext: false };
}

function detectSemanticSubject(normalized: string, isQuestion: boolean): SemanticSubject {
  if (/\b(?:мы|нам|нас|наш|наша|наше|наши)\b/u.test(normalized)) return "shared";
  if (isQuestion && /(?:^|\s)(?:ты|тебе|тебя|у тебя|твое|твоё|твой|твоя)(?:\s|$)/u.test(normalized)) return "character";
  if (/(?:^|\s)(?:я|мне|меня|у меня|мой|моя|мое|моё|мои)(?:\s|$)/u.test(normalized)) return "user";
  if (/(?:^|\s)(?:он|она|они|ему|ей|их|друг|подруга|парень|девушка|начальник|коллега)(?:\s|$)/u.test(normalized)) return "other";
  return "unknown";
}

function semanticFocus(normalized: string): { focus?: string; stance?: SemanticStance } {
  const patterns: Array<[RegExp, SemanticStance]> = [
    [/^(?:я\s+)?(?:сегодня|завтра|сейчас|потом)?\s*не\s+хочу\s+(.+)$/u, "avoid"],
    [/^(?:сегодня|завтра|сейчас|потом)\s+не\s+хочу\s+(.+)$/u, "avoid"],
    [/^(?:мне\s+)?не\s+хочется\s+(.+)$/u, "avoid"],
    [/^(?:я\s+)?(?:сегодня|завтра|сейчас|потом)?\s*хочу\s+(.+)$/u, "want"],
    [/^(?:сегодня|завтра|сейчас|потом)\s+хочу\s+(.+)$/u, "want"],
    [/^(?:мне\s+)?хочется\s+(.+)$/u, "want"],
    [/^(?:мне\s+)?не\s+нравится\s+(.+)$/u, "dislike"],
    [/^я\s+не\s+люблю\s+(.+)$/u, "dislike"],
    [/^(?:мне\s+)?(?:вроде\s+)?нравится\s+(.+)$/u, "like"],
    [/^я\s+(?:люблю|обожаю)\s+(.+)$/u, "like"],
    [/^(?:я\s+)?(?:планирую|собираюсь)\s+(.+)$/u, "plan"],
    [/^я\s+(?:решил|решила)\s+(.+)$/u, "plan"],
    [/^я\s+передумал(?:а)?(?:\s+(.+))?$/u, "change_mind"],
    [/^(?:мне\s+)?(?:кажется|думается)\s*,?\s*(?:что\s+)?(.+)$/u, "believe"],
    [/^я\s+думаю\s*,?\s*(?:что\s+)?(.+)$/u, "believe"],
  ];
  for (const [pattern, stance] of patterns) {
    const match = pattern.exec(normalized);
    if (match) return { focus: compactSemantic(match[1]), stance };
  }
  return {};
}

function extractReason(normalized: string) {
  const match = /(?:\s|^)(?:потому\s+что|так\s+как|из-за\s+того\s+что|из-за)\s+(.+)$/u.exec(normalized);
  return compactSemantic(match?.[1], 92);
}

function extractCorrection(normalized: string) {
  const patterns = [
    /^(?:нет\s*[,.:;-]?\s*)?(?:я\s+)?не\s+про\s+(.+?)(?:\s*[,;]\s*|\s+)(?:а\s+)?(?:я\s+)?(?:про\s+)?(.+)$/u,
    /^(?:нет\s*[,.:;-]?\s*)?(?:я\s+)?имел(?:а)?\s+в\s+виду\s+не\s+(.+?)(?:\s*[,;]\s*|\s+)а\s+(.+)$/u,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (match) return { from: compactSemantic(match[1], 64), to: compactSemantic(match[2], 84) };
  }
  return {};
}

export function extractSemanticFrame(text: string, isQuestion: boolean): LocalSemanticFrame {
  const normalized = normalizeDialogueForMatching(text);
  const semanticBase = normalized
    .replace(/^(?:(?:ну|короче|слушай|смотри|кстати|в общем|если честно)\s*[,.:;-]?\s*)+/u, "")
    .trim();
  const correction = extractCorrection(semanticBase);
  const focused = semanticFocus(semanticBase);
  const wantsListening = /(?:без\s+советов|не\s+надо\s+советов|не\s+советуй|просто\s+послушай|просто\s+выслушай|просто\s+побудь\s+(?:рядом|со\s+мной))/u.test(semanticBase);
  const wantsAdvice = !wantsListening && /(?:^|[,;.!?]\s*)(?:(?:ну\s+)?и\s+)?что\s+(?:мне\s+)?(?:теперь\s+)?делать(?:\s|$|[?.!])|(?:^|[,;.!?]\s*)что\s+делать\s+теперь(?:\s|$|[?.!])|как\s+мне\s+лучше|как\s+лучше\s+поступить|посоветуй|что\s+бы\s+ты\s+(?:сделала|посоветовала)|как\s+бы\s+ты\s+поступила|стоит\s+ли\s+мне|(?:думаю|не\s+знаю|решаю)\s+.+\s+или\s+нет|(?:а\s+)?ты\s+бы\s+что\s+(?:сделала|выбрала|посоветовала)(?:\s+на\s+моем\s+месте)?|если\s+бы\s+ты\s+была\s+на\s+моем\s+месте|(?:будь|была)\s+ты\s+на\s+моем\s+месте/u.test(semanticBase);
  const asksCharacterView = /(?:что\s+(?:ты\s+)?думаешь|как\s+(?:ты\s+)?думаешь|как\s+(?:ты\s+)?считаешь|как\s+ты\s+к\s+этому\s+относишься|как\s+ты\s+относишься|по-твоему|твое\s+мнение|что\s+скажешь|как\s+тебе|(?:^|\s)ты\s+бы(?:\s|$))/u.test(semanticBase) ||
    (isQuestion && /(?:^|\s)ты[^?.!]{0,36}(?:соглашаешься|поддакиваешь)(?:\s|$|[?.!])/u.test(semanticBase));
  const reciprocal = /^(?:а\s+)?(?:ты|тебе|у\s+тебя|сама)(?:\s+как)?[?.! ]*$/u.test(semanticBase);
  const hypothetical = /(?:^|\s)(?:если\s+бы|представь|допустим|а\s+если)(?:\s|$)/u.test(semanticBase) ||
    (isQuestion && /(?:^|\s)бы(?:\s|$)/u.test(semanticBase));

  let stance: SemanticStance = focused.stance ?? "neutral";
  if (wantsListening || wantsAdvice) stance = "request";
  else if (asksCharacterView) stance = "ask_opinion";
  else if (isQuestion) stance = "ask_fact";
  else if (/(?:^|\s)(?:чувствую|грустно|плохо|тревожно|одиноко|скучно|устал|устала|злюсь|бесит)(?:\s|$|[,.!?])/u.test(semanticBase)) stance = "feel";
  else if (/^(?:да|нет|понял|понятно|ясно|ладно|окей)(?:\s|$|[,.!?])/u.test(semanticBase)) stance = "react";

  let focus = focused.focus;
  let reason = extractReason(semanticBase);
  let alternative: string | undefined;
  if (focus && !reason && ["want", "plan"].includes(focused.stance ?? "")) {
    const trailingReason = /^(.+?)\s*,\s*((?:давно|ведь|потому|так как|а то)\s+.+)$/u.exec(focus);
    if (trailingReason) {
      focus = compactSemantic(trailingReason[1]);
      reason = compactSemantic(trailingReason[2], 92);
    }
  }
  if (focus && reason) {
    const reasonMarker = /\s+(?:потому\s+что|так\s+как|из-за\s+того\s+что|из-за)\s+.+$/u;
    const withoutReason = focus.replace(reasonMarker, "").trim();
    if (withoutReason) focus = compactSemantic(withoutReason);
  }
  if (focus && focused.stance === "avoid") {
    const alt = /^(.+?)\s*,\s*просто\s+(.+)$/u.exec(focus);
    if (alt) {
      focus = compactSemantic(alt[1]);
      alternative = compactSemantic(alt[2], 88);
    }
  }
  if (!focus && asksCharacterView) {
    const opinion = /(?:что\s+(?:ты\s+)?думаешь|как\s+(?:ты\s+)?думаешь|как\s+(?:ты\s+)?считаешь|как\s+ты\s+относишься|что\s+скажешь|как\s+тебе)(?:\s+(?:к|про|об|о|насчет|насчёт))?\s*[,.:;-]?\s+(.+)$/u.exec(semanticBase);
    focus = compactSemantic(opinion?.[1]);
  }
  if (!focus && isQuestion) {
    const preferenceQuestion = /(?:тебе\s+бы\s+понравилось|тебе\s+нравится|ты\s+(?:хотела|хочешь)\s+(?:бы\s+)?|ты\s+любишь\s+)(.+?)[?.! ]*$/u.exec(semanticBase);
    focus = compactSemantic(preferenceQuestion?.[1]);
  }
  if (!focus && !isQuestion && meaningfulTokenCount(normalized) >= 3)
    focus = compactSemantic(semanticBase.replace(/^(?:я\s+)?(?:сегодня|вчера|завтра)\s+/u, ""));

  return {
    subject: detectSemanticSubject(semanticBase, isQuestion),
    stance,
    focus,
    reason,
    alternative,
    correctionFrom: correction.from,
    correctionTo: correction.to,
    hypothetical,
    wantsAdvice,
    wantsListening,
    asksCharacterView,
    reciprocal,
    meaningfulTokens: meaningfulTokenCount(semanticBase),
    intimacy: detectLocalIntimacySignal(semanticBase),
  };
}

// ---- fuzzy-match.ts ----
function boundedDistance(a: string, b: string, maxDistance: number) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1);
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = current[j - 1]! + 1;
      const deletion = previous[j]! + 1;
      current[j] = Math.min(substitution, insertion, deletion);
      rowMin = Math.min(rowMin, current[j]!);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[b.length] ?? maxDistance + 1;
}

function maxTokenDistance(token: string) {
  if (token.length < 5) return 0;
  return token.length >= 9 ? 2 : 1;
}

export function fuzzyTokenEquals(left: string, right: string) {
  const a = normalizeDialogueForMatching(left);
  const b = normalizeDialogueForMatching(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const maxDistance = Math.min(maxTokenDistance(a), maxTokenDistance(b));
  if (maxDistance <= 0) return false;
  return boundedDistance(a, b, maxDistance) <= maxDistance;
}

export function fuzzyTokenInList(target: string, tokens: readonly string[]) {
  const normalizedTarget = normalizeDialogueForMatching(target);
  return tokens.some((token) => fuzzyTokenEquals(token, normalizedTarget));
}

export function fuzzyPhraseEquals(text: string, phrase: string) {
  const textTokens = tokenizeDialogue(text);
  const phraseTokens = tokenizeDialogue(phrase);
  if (textTokens.length !== phraseTokens.length || phraseTokens.length < 2 || phraseTokens.length > 7)
    return false;
  let fuzzyCount = 0;
  for (let index = 0; index < phraseTokens.length; index += 1) {
    const actual = textTokens[index]!;
    const expected = phraseTokens[index]!;
    if (actual === expected) continue;
    if (!fuzzyTokenEquals(actual, expected)) return false;
    fuzzyCount += 1;
    if (fuzzyCount > 2) return false;
  }
  return fuzzyCount > 0;
}

// ---- intent-classifier.ts ----
const NEGATION_RE = /(?:^|\s)(?:не|нет|неа|никогда|ни разу)(?:\s|$)/u;

export interface IntentScore {
  definition: IntentDefinition;
  score: number;
  matched: string[];
  blocked: boolean;
}

export function detectNegation(text: string): boolean {
  return NEGATION_RE.test(normalizeDialogueForMatching(text));
}

const NORMALIZED = new Map(
  russianLanguagePack.intents.map((definition) => [
    definition.id,
    {
      phrases: [...new Set(definition.patterns.phrases.map(normalizeDialogueForMatching).filter(Boolean))],
      tokens: [...new Set(definition.patterns.tokens.map(normalizeDialogueForMatching).filter(Boolean))],
      negatives: definition.negativePatterns.map(normalizeDialogueForMatching).filter(Boolean),
    },
  ]),
);

function matchesNegativePattern(normalized: string, definition: IntentDefinition) {
  return (NORMALIZED.get(definition.id)?.negatives ?? []).some((pattern) => normalized.includes(pattern));
}

function scorePass(
  text: string,
  normalized: string,
  tokens: readonly string[],
  stems: ReadonlySet<string>,
  conceptSet: ReadonlySet<string>,
  allowFuzzy: boolean,
): IntentScore[] {
  const scores: IntentScore[] = [];

  for (const definition of russianLanguagePack.intents) {
    if (definition.id === "unknown" || definition.id === "statement") continue;
    const matched: string[] = [];
    const blocked = matchesNegativePattern(normalized, definition);
    if (blocked) {
      scores.push({ definition, score: -1, matched, blocked: true });
      continue;
    }

    const cached = NORMALIZED.get(definition.id)!;
    let raw = 0;
    for (let index = 0; index < cached.phrases.length; index += 1) {
      const target = cached.phrases[index]!;
      const source = definition.patterns.phrases[index] ?? target;
      if (normalized === target) {
        raw += 6;
        matched.push(`phrase:${source}`);
      } else if (target.length >= 3 && normalized.includes(target)) {
        // A one-word reaction ("нет", "спасибо", "прости") inside a longer
        // sentence must not hijack the whole utterance. Multi-word phrase hits
        // remain strong because they carry actual structure.
        const targetWords = target.split(/\s+/u).filter(Boolean).length;
        raw += targetWords === 1 ? 0.55 : 2.5;
        matched.push(`phrase:${source}`);
      }
    }

    for (const pattern of definition.patterns.regex) {
      try {
        if (new RegExp(pattern, "iu").test(normalized)) {
          raw += 4.5;
          matched.push(`regex:${pattern}`);
        }
      } catch {
        // Invalid regex is reported by pack validation.
      }
    }

    for (let index = 0; index < cached.tokens.length; index += 1) {
      const target = cached.tokens[index]!;
      const source = definition.patterns.tokens[index] ?? target;
      const stem = tokenStem(target);
      if (tokens.includes(target) || stems.has(stem)) {
        raw += 1.25;
        matched.push(`token:${source}`);
      }
    }

    if (raw <= 0 && allowFuzzy) {
      for (let index = 0; index < cached.phrases.length; index += 1) {
        const target = cached.phrases[index]!;
        if (fuzzyPhraseEquals(normalized, target)) {
          raw += 2.65;
          matched.push(`fuzzy-phrase:${definition.patterns.phrases[index] ?? target}`);
          break;
        }
      }
      if (raw <= 0) {
        for (let index = 0; index < cached.tokens.length; index += 1) {
          const target = cached.tokens[index]!;
          if (target.length < 7 || !tokens.some((token) => token[0] === target[0])) continue;
          if (fuzzyTokenInList(target, tokens)) {
            raw += 0.82;
            matched.push(`fuzzy-token:${definition.patterns.tokens[index] ?? target}`);
            break;
          }
        }
      }
    }

    if (raw <= 0) continue;
    // Short acknowledgements are turn-level reactions, not sentence-level keywords.
    // "...или нет" and "да, но..." must keep the meaning of the full sentence.
    if (["short_yes", "short_no", "acknowledgement"].includes(definition.id) && tokens.length > 3) {
      const exactShort = cached.phrases.some((phrase) => normalized === phrase);
      if (!exactShort) raw *= 0.28;
    }
    for (const concept of definition.concepts) if (conceptSet.has(concept)) raw += 0.45;
    const score = raw + definition.priority / 110;
    scores.push({ definition, score, matched, blocked: false });
  }

  return scores.sort(
    (a, b) =>
      b.score - a.score ||
      b.definition.priority - a.definition.priority ||
      a.definition.id.localeCompare(b.definition.id),
  );
}

export function scoreIntents(text: string, matchedConcepts: readonly string[]): IntentScore[] {
  const normalized = normalizeDialogueForMatching(text);
  const tokens = tokenizeDialogue(text);
  const stems = new Set(tokens.map(tokenStem));
  const conceptSet = new Set(matchedConcepts);
  const direct = scorePass(text, normalized, tokens, stems, conceptSet, false);
  const bestDirect = direct.find((entry) => !entry.blocked && entry.score > 0)?.score ?? 0;
  // Fuzzy matching is a recovery path for typos, not the default hot path.
  // This keeps ordinary local turns fast on mobile while still tolerating misspellings.
  if (bestDirect >= 2.2) return direct;
  return scorePass(text, normalized, tokens, stems, conceptSet, true);
}

// ---- question-classifier.ts ----
const QUESTION_START_RE = /^(?:а\s+)?(что|почему|как|где|когда|кто|какой|какая|какие|который|сколько|зачем|чем)(?:\s|$)/u;
const CONVERSATIONAL_QUESTION_RE = /^(?:ну\s+)?(?:(?:ты\s+как)|(?:как\s+ты)|(?:настроение\s+как)|(?:что|чем)\s+(?:ты\s+)?(?:делаешь|занимаешься)|(?:как\s+тебя\s+зовут)|(?:у\s+тебя\s+(?:все|всё)\s+нормально)|(?:ты\s+в\s+порядке))(?:[?.! ]*)$/u;
const QUESTION_PRONOUN_RE = /^(?:ты|тебе|тебя|у тебя|можешь|хочешь|будешь|есть ли|правда ли)(?:\s|$)/u;

export function classifyQuestion(text: string): { isQuestion: boolean; questionType?: LocalQuestionType } {
  const normalized = normalizeDialogueForMatching(text);
  const questionWord = QUESTION_START_RE.exec(normalized)?.[1];
  const isQuestion =
    /\?/u.test(text) ||
    Boolean(questionWord) ||
    QUESTION_PRONOUN_RE.test(normalized) ||
    CONVERSATIONAL_QUESTION_RE.test(normalized);

  if (!isQuestion) return { isQuestion: false };
  if (/\b(?:или|либо)\b/u.test(normalized) && /\?/u.test(text))
    return { isQuestion, questionType: "choice" };
  if (questionWord === "почему" || questionWord === "зачем")
    return { isQuestion, questionType: "why" };
  if (questionWord === "как") return { isQuestion, questionType: "how" };
  if (questionWord === "где") return { isQuestion, questionType: "where" };
  if (questionWord === "когда") return { isQuestion, questionType: "when" };
  if (questionWord === "кто") return { isQuestion, questionType: "who" };
  if (["что", "чем", "какой", "какая", "какие", "который", "сколько"].includes(questionWord ?? ""))
    return { isQuestion, questionType: "what" };
  if (/^(?:ну\s+)?(?:ты\s+как|как\s+ты|настроение\s+как)/u.test(normalized))
    return { isQuestion, questionType: "how" };
  return { isQuestion, questionType: "yes_no" };
}

// ---- sentiment.ts ----
const VERY_NEGATIVE = /(?:ненавиж|ужас|кошмар|в бешенстве|пиздец|хуже некуда)/u;
const NEGATIVE = /(?:груст|устал|тревож|пережива|стресс|одинок|скучно|плохо|неприят|проблем|злюсь|бесит)/u;
const VERY_POSITIVE = /(?:обожаю|в восторге|счастлив|счастлива|лучший день|охуенно|невероятно рад|невероятно рада)/u;
const POSITIVE = /(?:рад|рада|круто|хорошо|спасибо|люблю|нравится|получилось|классно)/u;

export function detectSentiment(text: string, hinted?: LocalSentiment, negation = false): LocalSentiment {
  const normalized = normalizeDialogueForMatching(text);
  if (VERY_NEGATIVE.test(normalized)) return negation ? "neutral" : "very_negative";
  if (VERY_POSITIVE.test(normalized)) return negation ? "neutral" : "very_positive";
  if (NEGATIVE.test(normalized)) return negation ? "neutral" : "negative";
  if (POSITIVE.test(normalized)) return negation ? "neutral" : "positive";
  return hinted ?? "neutral";
}

// ---- topic-classifier.ts ----
export function classifyTopic(text: string): string | undefined {
  const normalized = normalizeDialogueForMatching(text);
  const tokens = tokenizeDialogue(text);
  const stems = new Set(tokens.map(tokenStem));
  let best: { id: string; score: number } | undefined;
  for (const [id, definition] of Object.entries(russianLanguagePack.topics)) {
    let score = 0;
    for (const phrase of definition.phrases) if (normalized.includes(normalizeDialogueForMatching(phrase))) score += 3;
    for (const token of definition.tokens) {
      const stem = tokenStem(normalizeDialogueForMatching(token));
      if (stems.has(stem) || tokens.includes(normalizeDialogueForMatching(token))) score += 1;
    }
    if (score > (best?.score ?? 0)) best = { id, score };
  }
  return best && best.score > 0 ? best.id : undefined;
}

// ---- nlu.ts ----
function matchedConcepts(text: string) {
  const normalized = normalizeDialogueForMatching(text);
  const tokens = tokenizeDialogue(text);
  const stems = new Set(tokens.map(tokenStem));
  const matches: string[] = [];
  for (const concept of russianLanguagePack.concepts) {
    const phraseHit = concept.phrases.some((phrase) => {
      const target = normalizeDialogueForMatching(phrase);
      return target.length >= 2 && normalized.includes(target);
    });
    const tokenHit = concept.tokens.some((token) => {
      const target = normalizeDialogueForMatching(token);
      return tokens.includes(target) || stems.has(tokenStem(target));
    });
    if (phraseHit || tokenHit) matches.push(concept.id);
  }
  return matches;
}

function inferIntensity(text: string, sentiment: LocalSentiment) {
  const normalized = normalizeDialogueForMatching(text);
  let value = sentiment === "very_negative" || sentiment === "very_positive" ? 0.85 : sentiment === "negative" || sentiment === "positive" ? 0.58 : 0.35;
  if (/(?:очень|совсем|ужасно|реально|прям|вообще|крайне|безумно)/u.test(normalized)) value += 0.14;
  if (/!{2,}/u.test(text)) value += 0.08;
  return Math.max(0, Math.min(1, value));
}

export function analyzeLocalNLU(text: string): LocalNLUResult {
  const normalized = normalizeDialogueForMatching(text);
  const concepts = matchedConcepts(text);
  const negation = detectNegation(text);
  const scores = scoreIntents(text, concepts);
  const top = scores.find((score) => !score.blocked && score.score > 0);
  const question = classifyQuestion(text);
  const semantic = extractSemanticFrame(text, question.isQuestion);

  let intent = top?.definition.id ?? (question.isQuestion ? "unknown" : normalized ? "statement" : "unknown");

  // High-signal semantic corrections beat broad phrase overlap.
  if (semantic.wantsListening) intent = "ask_for_support";
  else if (semantic.correctionTo) intent = "reference_previous_topic";
  else if (semantic.wantsAdvice) intent = "ask_for_opinion";
  else if (/^(?:не|нет|неа)\s*[,.:;-]?\s*(?:подожди\s*[,.:;-]?\s*)?(?:я\s+)?(?:другое\s+имел(?:а)?\s+в\s+виду|не\s+это\s+имел(?:а)?\s+в\s+виду)/u.test(normalized)) intent = "reference_previous_topic";
  else if (!question.isQuestion && /(?:вроде|как будто)?\s*все\s+нормальн.{0,16}(?:но|а)\s+(?:настроение|мне)\s+.*(?:паршив|плох|груст|тоск|не очень)/u.test(normalized)) intent = "user_sad";
  else if (!question.isQuestion && /(?:мне\s+)?(?:вроде\s+)?нравится\s+.+\s+но\s+.+(?:туп|сомн|плох|не уверен|не уверена|странн)/u.test(normalized)) intent = "uncertain";
  else if (/^(?:я\s+)?не\s+понимаю\s+почему\s+(?:он|она|они)(?:\s|$)/u.test(normalized)) intent = "uncertain";
  else if (question.isQuestion && /(?:тебе\s+(?:правда\s+)?интересно|тебе\s+не\s+скучно).*(?:что\s+я|со\s+мной|слушать\s+меня)/u.test(normalized)) intent = "ask_relationship";
  else if (semantic.asksCharacterView && semantic.focus && /как\s+ты\s+относишься/u.test(normalized)) intent = "ask_character_opinion";
  else if (question.isQuestion && semantic.subject === "character" && /(?:злишься|грустишь|обиделась|расстроилась|устала|скучала|переживаешь|тревожишься|в\s+порядке|нормально\s+ли)/u.test(normalized)) intent = "ask_character_state";
  else if (question.isQuestion && semantic.subject === "character" && intent !== "ask_relationship" && /(?:нравится|понравилось|любишь|хочешь|предпочитаешь|выбрала|выберешь)/u.test(normalized)) intent = "ask_character_preference";
  else if (question.isQuestion && /(?:я\s+тебе\s+надоел|я\s+тебе\s+надоела|тебе\s+со\s+мной\s+скучно|ты\s+мне\s+доверяешь|ты\s+по\s+мне\s+скучала|ты\s+меня\s+ревнуешь)/u.test(normalized)) intent = "ask_relationship";
  else if (semantic.asksCharacterView && /(?:обо\s+мне|про\s+меня|как\s+я\s+тебе)/u.test(normalized)) intent = "ask_character_opinion";
  else if (semantic.asksCharacterView && /(?:^|\s)ты\s+бы(?:\s|$)/u.test(normalized) && !/(?:что\s+бы\s+ты\s+(?:сделала|посоветовала)|как\s+бы\s+ты\s+поступила)/u.test(normalized)) intent = "ask_character_opinion";
  else if (semantic.asksCharacterView && semantic.subject === "character" && intent === "unknown") intent = "ask_character_opinion";

  // Very short contextual phrases should keep their dedicated intent when possible.
  if (/^(?:а\s+)?ты[?.! ]*$/u.test(normalized)) intent = "ask_followup";
  if (/^(?:а\s+)?если\s+серьезно[?.! ]*$/u.test(normalized) || /^(?:ну\s+)?а\s+серьезно[?.! ]*$/u.test(normalized)) intent = "ask_followup";
  if (/^(?:(?:короче|ну)\s+)?я\s+передумал(?:а)?[?.! ]*$/u.test(normalized)) intent = "reference_previous_topic";

  const topScore = top?.score ?? 0;
  let confidence = top
    ? Math.max(0.4, Math.min(0.99, 0.38 + topScore / 8.5))
    : normalized.length > 2 ? 0.28 : 0.18;
  if (semantic.wantsListening || semantic.correctionTo || semantic.wantsAdvice) confidence = Math.max(confidence, 0.9);
  else if (semantic.asksCharacterView && intent !== "unknown") confidence = Math.max(confidence, 0.78);
  else if (["ask_character_state", "ask_character_preference", "ask_relationship"].includes(intent) && question.isQuestion) confidence = Math.max(confidence, 0.74);
  else if (semantic.focus && intent === "statement") confidence = Math.max(confidence, 0.54);

  const secondaryIntents = scores
    .filter((entry) => !entry.blocked && entry.definition.id !== intent && entry.score >= Math.max(2.2, topScore - 1.35))
    .slice(0, 4)
    .map((entry) => entry.definition.id);
  // When a high-signal semantic structure (for example an embedded advice
  // request) deliberately overrides the lexical winner, keep that winner as a
  // secondary thought. This prevents long messages such as "я устал, думаю
  // увольняться, что мне теперь делать?" from losing the emotional disclosure.
  if (top && top.definition.id !== intent && top.score >= 2.2 && !secondaryIntents.includes(top.definition.id))
    secondaryIntents.unshift(top.definition.id);
  const hintedSentiment = top?.definition.sentiment;
  const sentiment = hintedSentiment ?? detectSentiment(text, undefined, negation);
  const semanticTopic = semantic.correctionTo ? classifyTopic(semantic.correctionTo) : undefined;
  const topic = semanticTopic ?? top?.definition.topic ?? classifyTopic(text);

  return {
    intent,
    secondaryIntents,
    topic,
    sentiment,
    questionType: question.questionType,
    isQuestion: question.isQuestion,
    negation,
    intensity: inferIntensity(text, sentiment),
    entities: extractEntities(text),
    matchedConcepts: concepts,
    semantic,
    confidence,
  };
}

// ---- perception-adapter.ts ----
const PROTECTED_BROAD = new Set<PerceptionIntent>(["boundary", "affection", "apology", "invitation", "request"]);

function broadIntent(nlu: LocalNLUResult): PerceptionIntent | undefined {
  if (["ask_character_state","ask_character_identity","ask_character_name","ask_character_age","ask_relationship","ask_character_opinion","ask_character_preference","ask_character_activity","ask_for_opinion","ask_why","ask_followup","clarification_request","memory_question","ask_user_memory","external_fact_question"].includes(nlu.intent)) return "question";
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
