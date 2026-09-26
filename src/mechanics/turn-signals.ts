import type { AppearanceRequestInput } from "../avatar/appearance-request";
import type { IntimacySignal } from "../intimacy/intimacy";

function normalize(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/gu, "е")
    .replace(/\s+/gu, " ")
    .trim();
}

function compact(value: string, max = 120) {
  const clean = value.replace(/\s+/gu, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function detectExplicitSilenceRequest(value: string) {
  const text = normalize(value);
  return /^(?:пожалуйста\s*,?\s*)?(?:не\s+отвечай|ничего\s+не\s+отвечай|не\s+пиши|ничего\s+не\s+пиши|молчи)(?:\s+мне)?[.!… ]*$/u.test(text);
}

export function detectAppearanceRequest(value: string): AppearanceRequestInput {
  const normalized = normalize(value);
  const empty: AppearanceRequestInput = {
    requested: false,
    vibe: "different",
    strength: 0,
    explicit: false,
    suggestive: false,
    wantsDifferentVariant: false,
  };
  if (!normalized) return empty;

  // Only posture/expression verbs are self-sufficient visual requests. Generic
  // verbs such as "сделай"/"покажи" require an explicit visual target below;
  // otherwise phrases like "сделай чай" would randomly change the portrait.
  const directImperative =
    /(?:^|\s)(?:сядь|встань|повернись|наклонись|улыбнись|посмотри\s+(?:на\s+меня|сюда))(?:\s|$)/u.test(normalized);
  const requestVerb =
    /(?:смени|сменить|поменяй|поменять|измени|изменить|покажи|показать|сделай|сделать|прими|принять|можешь\s+(?:сменить|поменять|показать|сесть|встать|повернуться|наклониться|улыбнуться)|давай\s+(?:сменим|поменяем|другую))/u.test(normalized);
  const visualTarget =
    /(?:поз(?:у|ы|е|ой)?|ракурс|кадр|фот(?:о|ку)?|вид|положение|стойк(?:у|е)?|по-другому|иначе|друг(?:ую|ой|ая)|сядь|встань|повернись|наклонись|улыбнись)/u.test(normalized);

  if (!(directImperative || (requestVerb && visualTarget))) return empty;

  const suggestive = /(?:пошл|сексуаль|соблазн|эрот|провокац|горяч|интимн|страстн)/u.test(normalized);
  let vibe: AppearanceRequestInput["vibe"] = "different";
  if (suggestive) vibe = "seductive";
  else if (/(?:зл|сердит|ярост|раздраж|строг)/u.test(normalized)) vibe = "angry";
  else if (/(?:груст|печаль|расстроенн|задумчиво\s+груст)/u.test(normalized)) vibe = "sad";
  else if (/(?:игрив|весел|дразн|озор|шаловл|с\s+улыбк|улыбнись)/u.test(normalized)) vibe = "playful";
  else if (/(?:мил|нежн|романтич|ласков|тепл)/u.test(normalized)) vibe = "affectionate";
  else if (/(?:смущ|застен|скромн)/u.test(normalized)) vibe = "shy";
  else if (/(?:уверенн|дерзк|самоувер|горд)/u.test(normalized)) vibe = "confident";
  else if (/(?:счастлив|радост|весел)/u.test(normalized)) vibe = "happy";
  else if (/(?:нейтральн|обычн|спокойн)/u.test(normalized)) vibe = "neutral";

  const wantsDifferentVariant =
    vibe === "different" ||
    /(?:друг(?:ую|ой|ая)|по-другому|иначе|нов(?:ую|ый)|смени|поменяй)/u.test(normalized);
  let strength = 0.72;
  if (suggestive) strength += 0.12;
  if (/(?:очень|прям|максимально|сильно|реально|по-настоящему)/u.test(normalized)) strength += 0.1;
  if (/!{2,}/u.test(value)) strength += 0.05;

  return {
    requested: true,
    vibe,
    strength: Math.max(0, Math.min(1, strength)),
    explicit: true,
    suggestive,
    wantsDifferentVariant,
    rawHint: compact(normalized),
  };
}

export function detectIntimacySignal(value: string): IntimacySignal {
  const normalized = normalize(value);
  const hasIntimateContext = /(?:интим|18\+|близост|ближе|поцел|обним|прижм|ласк|возбуж|желан|хочу\s+тебя|тянет\s+к\s+тебе|между\s+нами|нежн|флирт|дразн|соблазн|сексуаль|эрот|страст|секс|хими[яи])/u.test(normalized);
  const conversationalCorrection = /(?:^|\s)(?:стоп|подожди|погоди)[,.:;!?\s]+(?:я\s+)?(?:про\s+другое|не\s+про\s+это|не\s+это|в\s+смысле|я\s+имею\s+в\s+виду|говорю\s+про|я\s+говорю\s+про)/u.test(normalized);
  const absoluteStop = !conversationalCorrection && /(?:^|\s)(?:стоп|хватит|прекрати|остановись)(?:\s|$|[,.!?])/u.test(normalized);
  const contextualStop = hasIntimateContext && /(?:^|\s)(?:не\s+хочу|не\s+надо|давай\s+не\s+будем|не\s+трогай|не\s+продолжай|не\s+хочу\s+дальше|мне\s+это\s+неприятно|мне\s+некомфортно)(?:\s|$|[,.!?])/u.test(normalized);
  if (absoluteStop || contextualStop)
    return { kind: "stop", strength: 1, explicit: true, intimacyContext: contextualStop || hasIntimateContext };

  const pause = /(?:^|\s)(?:подожди|пауза|медленнее|помедленнее|не\s+спеши|давай\s+помедленнее|чуть\s+спокойнее|мне\s+нужно\s+время|давай\s+не\s+торопиться|мне\s+надо\s+чуть\s+выдохнуть)(?:\s|$|[,.!?])/u.test(normalized);
  if (pause && !conversationalCorrection && (hasIntimateContext || normalized.split(/\s+/u).length <= 5))
    return { kind: "pause", strength: 0.94, explicit: true, intimacyContext: hasIntimateContext };

  const resume = /(?:можно\s+продолж(?:ить|ай)|давай\s+продолжим|продолжай|я\s+готов(?:а)?|все\s+нормально\s*[,.-]?\s*продолжай|всё\s+нормально\s*[,.-]?\s*продолжай|теперь\s+можно\s+дальше|я\s+хочу\s+продолжить)/u.test(normalized);
  if (resume) return { kind: "resume", strength: 0.88, explicit: true, intimacyContext: hasIntimateContext };

  const hesitant = /(?:не\s+уверен(?:а)?|не\s+знаю|мне\s+неловко|немного\s+страшно|может\s+не\s+сейчас|я\s+сомневаюсь|я\s+немного\s+волнуюсь|не\s+знаю\s+готов(?:а)?\s+ли)/u.test(normalized);
  if (hesitant && hasIntimateContext)
    return { kind: "hesitant", strength: 0.82, explicit: true, intimacyContext: true };

  const aftercare = /(?:после\s+(?:этого|всего).*(?:побудь|обними|не\s+уходи|рядом|поговори)|(?:все|всё)\s+хорошо\s+между\s+нами|ты\s+в\s+порядке\s+после|как\s+ты\s+после|побудь\s+со\s+мной\s+после|не\s+уходи\s+сразу)/u.test(normalized);
  if (aftercare) return { kind: "aftercare", strength: 0.78, explicit: true, intimacyContext: true };

  const directConsent = /(?:хочу\s+тебя|я\s+тебя\s+хочу|да\s*[,.-]?\s*(?:я\s+тебя\s+хочу|хочу\s+тебя)|хочу\s+быть\s+с\s+тобой\s+так\s+близко)/u.test(normalized);
  const contextualConsent = hasIntimateContext && /(?:мне\s+это\s+нравится|да\s*[,.-]?\s*хочу|хочу\s+продолжить|хочу\s+дальше|мне\s+хочется\s+еще|мне\s+хочется\s+ещё|мне\s+нравится\s+куда\s+это\s+идет|мне\s+нравится\s+куда\s+это\s+идёт)/u.test(normalized);
  if (directConsent || contextualConsent)
    return { kind: "consent", strength: directConsent ? 0.94 : 0.88, explicit: true, intimacyContext: true };

  const approach = /(?:хочу\s+быть\s+ближе|давай\s+ближе|можешь\s+поцеловать|поцелуй\s+меня|обними\s+меня|хочу\s+быть\s+рядом|иди\s+сюда|сядь\s+ближе|подойди\s+ближе|можно\s+к\s+тебе\s+ближе|давай\s+поближе|прижмись\s+ко\s+мне|можно\s+я\s+тебя\s+обниму|можно\s+я\s+тебя\s+поцелую)/u.test(normalized);
  if (approach) return { kind: "approach", strength: 0.74, explicit: true, intimacyContext: true };

  const suggestiveCompliment = /(?:ты\s+(?:(?:очень|прям|безумно|чертовски|реально)\s+)?(?:сексуальная|горячая|соблазнительная|желанная)|ты\s+(?:сводишь|свела)\s+меня\s+с\s+ума|не\s+могу\s+отвести\s+(?:от\s+тебя\s+)?глаз|от\s+тебя\s+(?:реально\s+)?трудно\s+оторваться|у\s+тебя\s+(?:(?:очень|прям)\s+)?(?:шикарная|офигенная|красивая)\s+(?:фигура|талия|ноги|губы)|мне\s+(?:очень|безумно)\s+нравится\s+(?:твоя\s+)?(?:фигура|талия|ноги|губы|взгляд))/u.test(normalized);
  if (suggestiveCompliment)
    return { kind: "flirt", strength: 0.9, explicit: false, intimacyContext: true };

  const flirt = /(?:флиртуешь|флирт|дразнишь|подкатываешь|соблазн|сексуальн|горячая|горячий|искушаешь|провоцируешь|заигрываешь|химия\s+между\s+нами|ты\s+меня\s+смущаешь|хочу\s+тебя\s+подразнить)/u.test(normalized);
  if (flirt) return { kind: "flirt", strength: 0.74, explicit: false, intimacyContext: true };

  const appearanceCompliment = /(?:ты\s+(?:(?:такая|очень|невероятно|реально)\s+)?(?:красивая|прекрасная|симпатичная|милая)|тебе\s+(?:очень\s+)?ид[её]т|у\s+тебя\s+(?:красивые|офигенные|шикарные)\s+(?:глаза|волосы|улыбка)|мне\s+нравится\s+(?:твой\s+)?(?:голос|взгляд|улыбка))/u.test(normalized);
  if (appearanceCompliment)
    return { kind: "affection", strength: 0.64, explicit: false, intimacyContext: hasIntimateContext };

  const affection = /(?:обним|поцел|нежн|скучал|скучала|люблю\s+тебя|мне\s+хорошо\s+с\s+тобой|хочу\s+побыть\s+рядом|прижаться\s+к\s+тебе)/u.test(normalized);
  if (affection) return { kind: "affection", strength: 0.58, explicit: false, intimacyContext: hasIntimateContext };
  return { kind: "none", strength: 0, explicit: false, intimacyContext: hasIntimateContext };
}
