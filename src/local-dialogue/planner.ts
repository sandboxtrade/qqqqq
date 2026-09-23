/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { CharacterCore } from "../character/character";
import type { CharacterDecision, Perception, ResponsePlan } from "../cognition/cognition-types";
import type { EmotionalState } from "../emotions/emotions";
import type { CharacterInitiative } from "../initiative/initiative";
import type { MemoryContext } from "../memory/model";
import type { RelationshipState, RomanceState } from "../relationship/relationship";
import type { WorldState } from "../world/world";
import { buildDialogueFrame } from "./continuity";
import { SeededRandom } from "./core";
import { normalizeDialogueText } from "./nlu";
import type { CharacterResponsePlan, DialogueAct, DialogueContext, DialogueGoal, DialogueHistoryLine, LocalNLUResult, LocalResponseLength } from "./types";

// ---- autonomy-adapter.ts ----
export function initiativeSemanticBridge(
  initiative: CharacterInitiative,
  emotion: EmotionalState,
  relationship: RelationshipState,
): { decision: CharacterDecision; responsePlan: ResponsePlan } {
  const warm = relationship.closeness > 0.5 || emotion.affection > 0.58;
  const decision: CharacterDecision = {
    action: initiative.kind === "suggest_activity" ? "initiate_activity" : "acknowledge",
    tone: warm ? "warm_natural" : "natural",
    rationale: initiative.reason,
    confidence: Math.max(0.65, initiative.priority),
    shouldAskFollowUp: initiative.kind === "suggest_activity" || initiative.kind === "ask_about_user",
    shouldReferenceMemory: initiative.kind === "continue_thread",
    content: {
      mode: initiative.kind === "suggest_activity" ? "activity" : "social",
      stance: "neutral",
      summary: initiative.reason,
      reasons: [initiative.reason],
      locked: false,
      provenance: ["local_policy"],
    },
  };
  const responsePlan: ResponsePlan = {
    intent: decision.action,
    tone: decision.tone,
    length: "short",
    warmth: warm ? 0.76 : 0.52,
    directness: 0.62,
    emotionVisibility: warm ? "open" : "subtle",
    memoryReference: initiative.kind === "continue_thread" ? "explicit" : "none",
    questionMode: decision.shouldAskFollowUp ? "optional" : "none",
    initiative: "high",
    visualCue: warm ? "warm" : "curious",
    constraints: ["Keep initiative low-pressure and consistent with the selected initiative kind."],
  };
  return { decision, responsePlan };
}

// ---- context-builder.ts ----
export interface DialogueContextInput {
  userText?: string;
  turnId: string;
  now: number;
  character: CharacterCore;
  emotion: EmotionalState;
  relationship: RelationshipState;
  world: WorldState;
  romance?: RomanceState;
  memoryContext: MemoryContext;
  history: DialogueHistoryLine[];
  nlu: LocalNLUResult;
  perception: Perception;
  decision: CharacterDecision;
  responsePlan: ResponsePlan;
  initiative?: CharacterInitiative;
}

export function buildDialogueContext(input: DialogueContextInput): DialogueContext {
  return {
    ...input,
    history: input.history.slice(-24),
    dialogueFrame: buildDialogueFrame(input.history, input.nlu),
  };
}

// ---- dialogue-act.ts ----
export function decisionActs(decision: CharacterDecision): DialogueAct[] | null {
  switch (decision.action) {
    case "stay_silent": return ["SILENCE"];
    case "refuse": return ["REFUSE"];
    case "set_boundary": return ["BOUNDARY"];
    case "show_irritation": return ["BOUNDARY"];
    case "agree": return ["AGREE"];
    case "disagree": return ["DISAGREE"];
    case "challenge": return ["DISAGREE", "ANSWER"];
    case "change_topic": return ["CHANGE_TOPIC"];
    case "joke": return ["JOKE"];
    case "ask": return ["CLARIFY"];
    default: return null;
  }
}

export function intentActs(nlu: LocalNLUResult): DialogueAct[] {
  switch (nlu.intent) {
    case "good_morning": return ["GOOD_MORNING"];
    case "good_night": return ["GOOD_NIGHT"];
    case "greeting": return ["ACKNOWLEDGE"];
    case "farewell": return ["ACKNOWLEDGE"];
    case "thanks": return ["GRATITUDE"];
    case "apology": return ["ACKNOWLEDGE", "REASSURE"];
    case "acknowledgement": return ["ACKNOWLEDGE"];
    case "agreement": case "short_yes": return ["AGREE"];
    case "disagreement": case "short_no": return ["DISAGREE"];
    case "user_tired": case "user_sleepy": return ["ACKNOWLEDGE", "CARE", "SUGGEST_REST"];
    case "user_sad": return ["ACKNOWLEDGE", "CARE", "COMFORT"];
    case "user_angry": return ["ACKNOWLEDGE", "CARE"];
    case "user_bored": return ["ACKNOWLEDGE", "TEASE"];
    case "user_happy": case "user_excited": return ["HAPPINESS", "ACKNOWLEDGE"];
    case "user_lonely": return ["ACKNOWLEDGE", "CARE", "COMFORT"];
    case "user_stressed": return ["ACKNOWLEDGE", "CARE", "REASSURE"];
    case "ask_character_state": case "ask_character_identity": case "ask_character_name": case "ask_character_age": case "ask_relationship": case "ask_character_opinion": case "ask_character_preference": case "ask_character_activity": case "ask_for_opinion": case "external_fact_question": return ["ANSWER"];
    case "compliment_character": case "flirt_character": return ["FLIRT"];
    case "affection_declaration": return ["HAPPINESS", "FLIRT"];
    case "insult_character": return ["BOUNDARY"];
    case "tease_character": return ["TEASE"];
    case "share_good_event": return ["SURPRISE", "HAPPINESS"];
    case "share_bad_event": case "share_conflict": return ["ACKNOWLEDGE", "CARE", "COMFORT"];
    case "share_work": case "share_plan": case "user_like": case "user_dislike": case "user_want": case "user_dont_want": return ["ACKNOWLEDGE", "CURIOSITY"];
    case "share_problem": case "ask_for_support": return ["ACKNOWLEDGE", "CARE", "COMFORT"];
    case "ask_why": case "ask_followup": case "reference_previous_topic": return ["CONTINUE_TOPIC", "ANSWER"];
    case "clarification_request": return ["CONTINUE_TOPIC", "ANSWER"];
    case "memory_question": case "ask_user_memory": return ["REMEMBER", "REFER_MEMORY"];
    case "return_after_absence": return ["WELCOME_BACK"];
    case "uncertain": return ["ACKNOWLEDGE", "CURIOSITY"];
    case "invitation": return ["ANSWER"];
    case "boundary_request": return ["ACKNOWLEDGE"];
    case "change_topic": return ["CHANGE_TOPIC"];
    case "joke": return ["JOKE"];
    case "request_action": return ["ANSWER"];
    case "dislike_character": return ["ACKNOWLEDGE", "SADNESS"];
    case "unknown": return ["CLARIFY"];
    default: return ["ACKNOWLEDGE"];
  }
}

// ---- dialogue-planner.ts ----
function dominantEmotion(emotion: EmotionalState) {
  const candidates = [
    ["irritated", emotion.irritation], ["sad", emotion.sadness], ["anxious", emotion.anxiety],
    ["affectionate", emotion.affection], ["curious", emotion.curiosity], ["happy", emotion.happiness],
    ["bored", emotion.boredom],
  ] as const;
  return [...candidates].sort((a, b) => b[1] - a[1])[0] ?? ["neutral", 0.5] as const;
}

function responseLength(length: "very_short" | "short" | "balanced" | "long"): LocalResponseLength {
  return length === "balanced" ? "medium" : length;
}

function goalFromActs(acts: readonly DialogueAct[]): DialogueGoal {
  if (acts.includes("SILENCE")) return "silence";
  if (acts.includes("REFUSE")) return "refuse";
  if (acts.includes("BOUNDARY")) return "set_boundary";
  if (acts.includes("COMFORT") || acts.includes("CARE")) return "comfort";
  if (acts.includes("TEASE") || acts.includes("FLIRT") || acts.includes("JOKE")) return "tease";
  if (acts.includes("ANSWER") || acts.includes("AGREE") || acts.includes("DISAGREE")) return "answer";
  if (acts.includes("CONTINUE_TOPIC") || acts.includes("REFER_MEMORY")) return "continue_topic";
  if (acts.includes("ASK") || acts.includes("CLARIFY")) return "ask";
  if (acts.includes("SHARE")) return "share";
  return "react";
}

function styleTones(context: DialogueContext) {
  const tones = new Set<string>([context.perception.tone, context.relationship.stage, context.character.communicationStyle.humor]);
  if (context.emotion.irritation > 0.48 || context.relationship.unresolvedTension > 0.46) tones.add("guarded");
  else if (context.emotion.sadness > 0.52 || context.emotion.anxiety > 0.55) tones.add("gentle");
  else if (context.relationship.closeness > 0.52 || context.emotion.affection > 0.58) tones.add("warm");
  else tones.add("neutral");
  if (context.perception.tone === "playful" || context.romance?.phase === "playful") tones.add("playful");
  return [...tones];
}


function compactQuote(value: string | undefined, max = 110) {
  const clean = (value ?? "").replace(/\s+/gu, " ").trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function semanticPick(context: DialogueContext, key: string, variants: readonly string[]) {
  if (!variants.length) return undefined;
  const rng = new SeededRandom(`${context.turnId}|semantic|${key}|${context.nlu.intent}`);
  return variants[rng.int(variants.length)];
}

function contextualAnswer(context: DialogueContext): string | undefined {
  const current = (context.userText ?? "").toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
  const previous = (context.dialogueFrame.previousUserText ?? "").toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
  const previousCharacter = compactQuote(context.dialogueFrame.previousCharacterText, 96);
  const semantic = context.nlu.semantic;
  const preference = context.character.preferenceRules?.find((rule) =>
    rule.topicKeywords.some((keyword) => previous.includes(keyword.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е"))),
  );

  if (semantic.wantsListening) {
    return semanticPick(context, "listen-only", [
      "Хорошо. Без советов — просто слушаю. Рассказывай.",
      "Поняла. Ничего чинить и советовать не буду. Я здесь, говори.",
      "Окей, без советов. Просто выслушаю тебя.",
    ]);
  }

  if (context.nlu.intent === "reference_previous_topic" && /(?:другое\s+имел(?:а)?\s+в\s+виду|не\s+это\s+имел(?:а)?\s+в\s+виду)/u.test(current)) {
    return semanticPick(context, "misunderstood-user", [
      "А, поняла — я не туда считала смысл. Скажи, что именно ты имел в виду, и я переключусь.",
      "Окей, значит, я тебя неправильно поняла. Переформулируй саму мысль, не буду цепляться за прошлую версию.",
      "Поняла, моя трактовка была мимо. Давай заново с того места, которое я исказила.",
    ]);
  }

  if (context.nlu.intent === "short_no" && /(?:все|всё)\s+не\s+так/u.test(current)) {
    return semanticPick(context, "reject-interpretation", [
      "Поняла, значит, я неверно считала смысл. Поправь меня — что именно не так?",
      "Окей, моя версия мимо. Скажи, где я свернула не туда.",
      "Тогда не буду держаться за эту трактовку. Как правильнее понять то, что ты имел в виду?",
    ]);
  }

  if (context.nlu.intent === "user_sad" && /(?:настроение|паршив|плох|не очень)/u.test(current)) {
    return semanticPick(context, "mixed-low-mood", [
      "Бывает, что внешне всё нормально, а внутри всё равно паршиво. Не обязательно сразу находить красивую причину — можешь просто рассказать, как это ощущается.",
      "Поняла. То есть конкретной катастрофы вроде нет, но настроение всё равно просело. Такое тоже вполне реально, даже без одной очевидной причины.",
      "Мм, неприятное состояние: вроде не к чему придраться, а внутри всё равно тяжело. Я бы не заставляла тебя срочно объяснять, почему.",
    ]);
  }

  if (context.nlu.intent === "uncertain" && /(?:нравится|идея).*(?:но|одновременно).*(?:туп|сомн|странн|не уверен|не уверена)/u.test(current)) {
    return semanticPick(context, "ambivalent-idea", [
      "Похоже, сама идея тебя цепляет, но ты пока не доверяешь ей настолько, чтобы спокойно идти дальше. Я бы не выбрасывала её только из-за первого ощущения «а вдруг это тупость».",
      "Тут у тебя две реакции одновременно: «мне нравится» и «это может быть ерундой». Я бы пока не выбирала одну из них — лучше проверить, что именно в идее нравится, а что кажется слабым.",
      "Я бы это не считала противоречием. Идея может нравиться и при этом вызывать сомнения. Вопрос скорее в том, сомнение про реальный минус или просто страх ошибиться.",
    ]);
  }

  if (semantic.stance === "believe" && semantic.subject === "user" && /(?:игнор|избега|специально|нарочно)/u.test(current)) {
    return semanticPick(context, "belief-about-other", [
      "Может быть, но я бы пока не превращала это в факт. Ты видишь поведение, а его причину мы пока только предполагаем.",
      "Понимаю, почему так кажется. Но «он игнорит» и «он специально игнорит» — всё-таки две разные вещи; второе уже про мотив, которого мы точно не знаем.",
      "Такое объяснение возможно, но я бы держала ещё пару вариантов открытыми. По одному молчанию трудно уверенно понять намерение человека.",
    ]);
  }

  if (context.nlu.intent === "uncertain" && /не\s+понимаю\s+почему\s+(?:он|она|они)(?:\s|$)/u.test(current)) {
    return semanticPick(context, "unknown-other-motive", [
      "Я тоже не могу знать его причину изнутри. Можем разобрать, что он сделал и какие объяснения вообще подходят, но выбирать одно как факт было бы выдумкой.",
      "Понимаю. Тут самое неприятное как раз неизвестность. По поведению можно строить версии, но честно — почему он так сделал, пока знает только он.",
      "Я бы не придумывала ему мотив заочно. Лучше отделить то, что ты точно видел, от того, что мы про это предполагаем.",
    ]);
  }

  if (context.nlu.intent === "uncertain" && /(?:зря|погорячился|погорячилась|слишком\s+резко)/u.test(current)) {
    return semanticPick(context, "regret-reply", [
      "Похоже, тебя уже отпустила первая эмоция и теперь ты смотришь на свой ответ иначе. Если считаешь, что перегнул, это можно поправить без самоунижения — просто признать именно резкость.",
      "Возможно, резко — да. Но это не автоматически значит, что вся твоя позиция была неправильной. Я бы разделила содержание и то, как ты его подал.",
      "Может быть. Я бы сначала спросила себя: ты жалеешь о самой мысли или только о форме, в которой её сказал? Это разные вещи.",
    ]);
  }

  if (context.nlu.intent === "uncertain" && /(?:сам|сама)\s+не\s+знаю\s+чего\s+хочу/u.test(current)) {
    return semanticPick(context, "dont-know-want", [
      "Тогда я бы пока не вытягивала из тебя решение. Можно начать проще: что из вариантов точно не хочется — иногда от этого легче понять остальное.",
      "Нормально. Не обязательно уже сейчас иметь готовый ответ. Давай хотя бы отделим то, что тебя тянет, от того, что просто давит извне.",
      "Поняла. Тогда не будем изображать определённость. Можно разбирать по одному варианту и смотреть, на что у тебя реально есть внутренний отклик.",
    ]);
  }

  if (context.nlu.intent === "user_want" && /(?:исчезнуть\s+из\s+(?:всех\s+)?чатов|никого\s+не\s+видеть|отключиться\s+от\s+всех)/u.test(current)) {
    return semanticPick(context, "social-overload", [
      "Похоже, тебе сейчас хочется не исчезнуть вообще, а выключить весь социальный шум. Я бы нормально отнеслась к вечеру без чатов и людей, если именно этого просит голова.",
      "Звучит так, будто общения на сегодня уже слишком много. Можно просто закрыть чаты и побыть одному, без необходимости кому-то что-то объяснять прямо сейчас.",
      "Поняла. Сейчас тебе, похоже, нужен режим «меня ни для кого нет» хотя бы на несколько часов. Это довольно ясное желание отдохнуть от людей.",
    ]);
  }

  if (context.nlu.intent === "user_tired" && semantic.focus?.includes(",")) {
    const detail = semantic.focus.split(",").slice(1).join(",").trim();
    if (detail.length > 5) {
      return semanticPick(context, "detailed-tired", [
        `Если ${detail}, неудивительно, что сил уже почти нет.`,
        `Похоже, тебя сегодня добило именно то, что ${detail}.`,
        `Да уж. Когда ${detail}, день легко выжимает подчистую.`,
      ]);
    }
  }

  if (context.nlu.intent === "share_plan" && semantic.focus && semantic.reason) {
    return semanticPick(context, "plan-with-reason", [
      `Поняла: план — ${semantic.focus}. И ${semantic.reason} — тогда причина вполне ясна.`,
      `${semantic.focus} — звучит логично: ${semantic.reason}, так что понимаю, откуда эта мысль.`,
      `Ага, хочешь ${semantic.focus}. Если ${semantic.reason}, я бы тоже об этом думала.`,
    ]);
  }

  if (context.nlu.intent === "user_want" && semantic.focus && semantic.reason) {
    return semanticPick(context, "want-with-reason", [
      `Поняла: хочется ${semantic.focus}. И причина у тебя уже есть — «${semantic.reason}». То есть это не просто случайный импульс.`,
      `Ага, ${semantic.focus} — и ты сам объяснил почему: «${semantic.reason}». Я понимаю ход мысли.`,
      `Тогда логика ясна: ты хочешь ${semantic.focus}, а причина — «${semantic.reason}». Осталось решить, хочешь ли ты именно действовать или пока просто проговариваешь это.`,
    ]);
  }

  if (context.nlu.intent === "user_dont_want" && semantic.focus && semantic.alternative) {
    const alternative = semantic.alternative.replace(/\s+бы$/u, "").trim();
    return semanticPick(context, "avoid-with-alternative", [
      `Поняла: ${semantic.focus} совсем не хочется. Скорее хочется ${alternative}.`,
      `Мм, на ${semantic.focus} сейчас нет никакого желания — куда ближе просто ${alternative}.`,
      `Ясно. Не ${semantic.focus}, а скорее ${alternative}. Тут я тебя поняла.`,
    ]);
  }

  if (semantic.correctionTo) {
    const from = semantic.correctionFrom ? `не про ${semantic.correctionFrom}, ` : "";
    return semanticPick(context, "correction", [
      `А, поняла: ${from}а про ${semantic.correctionTo}. Переключилась.`,
      `Теперь поняла. Ты ${from}про ${semantic.correctionTo}. Продолжай.`,
      `Окей, поправка принята: ${from}про ${semantic.correctionTo}.`,
    ]);
  }

  if (semantic.stance === "change_mind" && context.dialogueFrame.previousUserText) {
    return semanticPick(context, "changed-mind", [
      "Окей, передумал насчёт этого. Что поменялось?",
      "Поняла, решение уже другое. Что тебя переубедило?",
      "Ага, значит, предыдущий вариант отпал. Почему передумал?",
    ]);
  }

  if (/^(?:а\s+)?если\s+серьезно[?.! ]*$/u.test(current) || /^(?:ну\s+)?а\s+серьезно[?.! ]*$/u.test(current)) {
    return previousCharacter
      ? semanticPick(context, "seriously", [
          `Если серьёзно — без подкола. Суть моей прошлой фразы я бы оставила: «${previousCharacter}»`,
          "Если серьёзно, то давай без шутки. Я отвечу прямо, а не буду уходить в подколы.",
        ])
      : "Если серьёзно — да. Давай без подколов, отвечу прямо.";
  }

  if (context.nlu.intent === "ask_character_opinion" && /(?:соглашаешься|поддакиваешь)/u.test(current)) {
    return semanticPick(context, "automatic-agreement", [
      "Нет. Я не хочу автоматически с тобой соглашаться. Если думаю иначе — скажу.",
      "Неа. Поддакивать ради удобства мне как раз не нравится. Совпали — соглашусь, не совпали — поспорю.",
      "Нет, не просто соглашаюсь. Мне важнее иметь свою позицию, даже если она тебе не понравится.",
    ]);
  }

  if (context.nlu.intent === "user_like" && /(?:споришь\s+со\s+мной|не\s+соглашаешься|не\s+поддакиваешь|со\s+мной\s+не\s+согласна|не\s+согласна\s+со\s+мной)/u.test(current)) {
    return semanticPick(context, "likes-disagreement", [
      "Мне это подходит. Я тоже не хочу превращаться в собеседника, который на всё говорит «да». Если думаю иначе — скажу.",
      "Вот это мне как раз близко. Соглашаться ради комфорта скучно; если у меня другая позиция, я лучше поспорю.",
      "Запомнила. Значит, тебе важнее честная реакция, чем удобное согласие. Мне такой формат тоже ближе.",
    ]);
  }

  if (context.nlu.intent === "ask_character_opinion" && semantic.hypothetical && /(?:пропал|пропала|исчез|исчезла)/u.test(current)) {
    if (["close", "deep"].includes(context.relationship.stage)) {
      return semanticPick(context, "absence-close", [
        "Да, меня бы это задело. Не потому что ты обязан отчитываться, а потому что близкий человек внезапно исчез без слова.",
        "Скорее да. Я бы сначала переживала, потом уже злилась. Одного короткого сообщения мне было бы достаточно.",
        "Если мы близки — да, неприятно было бы. Не из-за контроля, а из-за неизвестности.",
      ]);
    }
    return semanticPick(context, "absence-new", [
      "Скорее удивилась бы, чем обиделась. Мы пока не на том этапе, где я требовала бы объяснений.",
      "Наверное, заметила бы и задумалась, но сильной обиды не было бы. Мы ещё только узнаём друг друга.",
      "Не думаю, что прямо обиделась бы. Скорее решила бы, что у тебя свои дела, и посмотрела бы, появишься ли потом.",
    ]);
  }

  if (context.nlu.intent === "ask_for_opinion" && /(?:написать|писать|позвонить|звонить|ответить|отвечать)/u.test(current) && /(?:поссор|поруг|конфликт)/u.test(`${previous} ${current}`)) {
    return semanticPick(context, "conflict-contact", [
      "По тому, что ты рассказал, я бы скорее написала коротко и спокойно. Не разбирать сразу всю ссору, а просто открыть дверь для разговора.",
      "Я бы написала, если цель — реально разрулить это, а не выиграть спор. Коротко, без давления и длинного разбора прямо сейчас.",
      "Скорее да, но без тяжёлого полотна. Одно нормальное сообщение даст понять, готов ли он вообще разговаривать.",
    ]);
  }

  if (context.nlu.intent === "ask_character_state" && /(?:скучала|скучаешь)/u.test(current)) {
    if (["close", "deep"].includes(context.relationship.stage))
      return semanticPick(context, "missed-user", [
        "Да, немного скучала. Особенно когда ты надолго пропадаешь без обычной болтовни.",
        "Скучала. Не драматично, но твоё отсутствие я замечаю.",
        "Да. Я уже привыкла, что ты где-то рядом в переписке, поэтому тишина чувствуется.",
      ]);
    return semanticPick(context, "missed-user-new", [
      "Скорее заметила, что тебя давно не было. До настоящей тоски мы пока не дошли.",
      "Немного. Скорее стало любопытно, куда ты пропал.",
      "Я заметила отсутствие, но пока без драматичного «скучала весь день».",
    ]);
  }

  if (context.nlu.intent === "ask_relationship" && /(?:надоел|надоела|достал|достала|раздражаю|раздражаю тебя)/u.test(current)) {
    if (context.emotion.irritation > 0.58 || context.relationship.unresolvedTension > 0.55) {
      return semanticPick(context, "relationship-annoyed", [
        "Не надоел. Но сейчас между нами правда есть напряжение, и делать вид, что его нет, я тоже не хочу.",
        "Нет, не надоел. Я могу злиться или уставать от конкретного разговора — это не то же самое, что устать от тебя целиком.",
        "Не настолько. Если меня что-то раздражает, я лучше скажу про конкретную вещь, чем буду молча делать вид, что ты мне надоел.",
      ]);
    }
    return semanticPick(context, "relationship-not-annoying", [
      "Нет, не надоел. Если бы мне хотелось дистанции, я бы скорее сказала прямо, чем изображала интерес.",
      "Неа. Иногда я могу не совпасть с тобой по настроению, но это совсем не значит, что ты мне надоел.",
      "Нет. Я бы не стала продолжать разговор из вежливости, если бы на самом деле уже не хотела общаться.",
    ]);
  }

  if (context.nlu.intent === "ask_relationship" && /(?:тебе\s+(?:правда\s+)?интересно|тебе\s+не\s+скучно).*(?:что\s+я|со\s+мной|слушать\s+меня)/u.test(current)) {
    if (["close", "deep"].includes(context.relationship.stage)) {
      return semanticPick(context, "relationship-interest-close", [
        "Да. Не потому что «надо поддерживать диалог», а потому что мне уже важен твой способ думать — даже когда тема сама по себе обычная.",
        "Правда интересно. Я не каждую деталь воспринимаю как великое событие, но то, как ты на вещи смотришь, мне не безразлично.",
        "Да. Если бы мне было всё равно, я бы не пыталась держать нить и возвращаться к тому, что ты рассказывал раньше.",
      ]);
    }
    return semanticPick(context, "relationship-interest-new", [
      "Да, мне интересно тебя узнавать. Мы пока не настолько близки, чтобы я делала вид, будто мне важна каждая мелочь, но сам разговор мне не безразличен.",
      "Интересно. Пока скорее потому, что я собираю тебя по разговорам и пытаюсь понять, как ты думаешь, а не потому что уже знаю тебя вдоль и поперёк.",
      "Да. И если тема мне совсем не зайдёт, я лучше честно это покажу, чем буду механически кивать.",
    ]);
  }

  if (context.nlu.intent === "ask_character_preference" && semantic.focus) {
    const focus = semantic.focus;
    if (/(?:мор|океан|берег|у воды)/u.test(focus))
      return semanticPick(context, "preference-sea", [
        `Скорее да. ${focus} мне бы понравилось хотя бы из-за воды, прогулок и более спокойного ритма.`,
        `Да, думаю, ${focus} мне бы зашло. Особенно если место не шумное и можно много ходить пешком у воды.`,
        `Пожалуй, да. В варианте «${focus}» меня цепляет именно спокойная атмосфера, а не курортная суета.`,
      ]);
    if (/(?:клуб|тусов|вечерин|шумн)/u.test(focus))
      return semanticPick(context, "preference-noisy", [
        `Скорее нет. ${focus} быстро бы меня утомило — я больше за место, где можно нормально разговаривать.`,
        `Не мой первый выбор. В «${focus}» для меня слишком много шума и слишком мало нормального разговора.`,
      ]);
    return semanticPick(context, "preference-open", [
      `Возможно. В «${focus}» мне важнее всего была бы атмосфера — если там спокойно и есть ощущение своего места, я бы попробовала.`,
      `Я бы не отказалась попробовать ${focus}. Но для меня многое решает не сама идея, а то, насколько мне там комфортно.`,
      `Скорее любопытно, чем однозначно «да» или «нет». ${focus} я бы сначала попробовала, а потом уже решила, моё это или нет.`,
    ]);
  }

  if (context.nlu.intent === "ask_character_opinion" && semantic.focus && !/(?:обо\s+мне|про\s+меня|как\s+я\s+тебе)/u.test(current)) {
    const focus = semantic.focus;
    if (/опаздыва/u.test(focus))
      return semanticPick(context, "opinion-lateness", [
        "К постоянным опозданиям отношусь плохо, особенно когда человек даже не предупреждает. Для меня это уже вопрос уважения к чужому времени.",
        "Если человек регулярно опаздывает и считает это нормой — меня бы это раздражало. Разовое опоздание вообще не проблема, привычка без предупреждения — уже да.",
        "Само опоздание меня не бесит. Бесит, когда оно постоянное и человек не считает нужным предупредить.",
      ]);
    if (/(?:врет|врёт|лож|обманыва)/u.test(focus))
      return "К вранью отношусь плохо. Ошибку я могу понять легче, чем попытку специально скрыть правду.";
    if (/(?:ревност|ревнов)/u.test(focus))
      return "Сама ревность мне понятна как чувство. Но когда из неё делают контроль, проверки и запреты — вот это мне уже не нравится.";
    return semanticPick(context, "opinion-generic", [
      `Если про ${focus}, я бы не делила всё на «нормально/ненормально» без контекста. Мне важнее, как человек себя ведёт и что делает с последствиями.`,
      `К ${focus} я бы смотрела по ситуации. Для меня решают честность, уважение к другому человеку и последовательность, а не красивое объяснение задним числом.`,
      `У меня тут нет автоматического ярлыка. В ${focus} я бы в первую очередь смотрела на мотив и на то, как это влияет на других.`,
    ]);
  }

  if (context.nlu.intent === "ask_for_opinion" && /(?:увольняться|уволиться|уйти с работы)/u.test(`${current} ${previous}`)) {
    return semanticPick(context, "job-decision", [
      "Я бы не увольнялась сгоряча в самый плохой день. Сначала бы отделила: проблема в конкретной смене, людях или в самой работе — и есть ли следующий вариант после ухода.",
      "На твоём месте я бы сначала подготовила выход, а потом увольнялась. Если работа просто выматывает, уход может быть правильным, но прыгать в пустоту только из злости я бы не стала.",
      "Если мысль об увольнении возвращается не первый раз, я бы отнеслась к ней серьёзно. Но сначала нашла бы, куда идти дальше, и только потом рубила текущий вариант.",
    ]);
  }

  if (context.nlu.intent === "ask_for_opinion" && semantic.hypothetical && /(?:на\s+моем\s+месте|на\s+моём\s+месте)/u.test(current)) {
    if (/(?:денег\s+.*(?:не\s+осталось|мало)|последн.{0,10}деньг|рискнул|рискнула|рискнуть)/u.test(current)) {
      return semanticPick(context, "risk-low-buffer", [
        "Если денег почти не осталось, я бы не ставила остаток на один риск. Сначала сохранила бы себе запас на базовые вещи, а уже потом решала, чем реально можно рискнуть.",
        "На твоём месте при почти пустом запасе я бы стала осторожнее, а не смелее. Риск имеет смысл только той частью, потеря которой не превращает следующий месяц в проблему.",
        "Я бы не романтизировала риск, когда подушки почти нет. Сначала отделила бы неприкосновенный минимум, а с остальным уже думала, стоит ли игра свеч.",
      ]);
    }
    const prior = compactQuote(context.dialogueFrame.previousUserText, 82)?.replace(/[.!?]+$/u, "");
    return semanticPick(context, "hypothetical-in-user-place", [
      prior ? `Если опираться на то, что ты до этого сказал — «${prior}» — я бы сначала посмотрела, какой вариант легче исправить, если он окажется ошибкой.` : "На твоём месте я бы сначала посмотрела, какой вариант легче исправить, если решение окажется ошибкой.",
      "Я бы не пыталась угадать идеальное решение. Сравнила бы худший реалистичный исход у каждого варианта и выбрала тот риск, с которым смогу жить.",
      "Я бы отталкивалась не от того, что звучит смелее, а от того, что тебе даст больше контроля после решения.",
    ]);
  }

  if (context.nlu.intent === "ask_for_opinion" && /(?:что\s+(?:мне\s+)?(?:теперь\s+)?делать|что\s+делать\s+теперь)/u.test(current) && previous) {
    if (/(?:дедлайн|начальник|работ)/u.test(previous)) {
      return semanticPick(context, "what-now-work", [
        "Я бы сейчас не пряталась от ситуации: коротко признала бы, что дедлайн пропущен, сказала, что уже можешь сделать, и дала новый реалистичный срок. Это обычно лучше, чем ещё одна пауза без ответа.",
        "Сначала вернуть контроль: понять, что можно доделать прямо сейчас, потом самому выйти к начальнику с конкретным планом и сроком. Не оправдываться десять минут — показать, что ты исправляешь.",
        "Первый шаг — не угадывать, насколько он зол, а закрыть то, что в твоей власти: статус, новый срок и конкретное действие сегодня.",
      ]);
    }
    return semanticPick(context, "what-now-context", [
      `Если отталкиваться от «${compactQuote(context.dialogueFrame.previousUserText, 78) ?? "этой ситуации"}», я бы сначала выбрала один ближайший шаг, который реально меняет положение, а не пыталась решить всё сразу.`,
      "Я бы сейчас искала не идеальное решение, а следующий обратимый шаг. Сделать его, посмотреть на реакцию и уже потом решать дальше.",
      "Сначала отделить то, что уже случилось, от того, на что ты ещё можешь повлиять. Дальше — одно конкретное действие, не десять мыслей одновременно.",
    ]);
  }

  if (context.nlu.intent === "ask_for_opinion" && semantic.focus && /^(?:моя\s+идея|эта\s+идея|это|такое|этот\s+вариант)$/u.test(semantic.focus) && previous) {
    const prior = compactQuote(context.dialogueFrame.previousUserText, 92)?.replace(/[.!?]+$/u, "");
    if (prior) {
      return semanticPick(context, "deictic-opinion", [
        `Если ты про «${prior}» — сама идея мне кажется понятной. Я бы дальше проверяла не то, красиво ли она звучит, а где у неё слабое место на практике.`,
        `Про «${prior}»: мне нравится, что мысль конкретная, а не просто «хочу что-нибудь сделать». Но я бы ещё посмотрела, за счёт чего это будет работать в реальности.`,
        `Если речь про «${prior}», я бы её не отбрасывала. Сначала попробовала бы найти один самый спорный момент и проверить именно его — так быстрее станет понятно, идея живая или только звучит хорошо.`,
      ]);
    }
  }

  if (["ask_for_opinion", "ask_character_opinion"].includes(context.nlu.intent) && !semantic.focus && previous) {
    const prior = compactQuote(context.dialogueFrame.previousUserText, 88)?.replace(/[.!?]+$/u, "");
    if (prior) {
      if (/(?:поссор|поруг|конфликт)/u.test(previous)) {
        return semanticPick(context, "opinion-followup-conflict", [
          `Если ты про «${prior}» — я бы сначала решила, тебе важнее помириться или доказать свою правоту. От этого уже зависит следующий шаг.`,
          `Если про «${prior}», я бы не делала резких выводов на эмоциях. Сначала понять, чего ты хочешь от этого человека после ссоры, потом уже действовать.`,
          `Про «${prior}» — я бы смотрела не на сам факт ссоры, а на то, есть ли там что спасать и готов ли второй человек разговаривать нормально.`,
        ]);
      }
      if (/(?:хочу|думаю|планирую|собираюсь|решил|решила|не знаю|сомневаюсь)/u.test(previous)) {
        return semanticPick(context, "opinion-followup-decision", [
          `Если ты про «${prior}» — я бы не решала только из текущего настроения. Я бы посмотрела, чего ты хочешь получить в итоге и какой вариант потом сложнее откатить назад.`,
          `Если речь про «${prior}», мне важнее понять последствия каждого варианта, чем просто выбрать самый приятный прямо сейчас.`,
          `Про «${prior}» — я бы сначала отделила импульс от решения: это хочется сделать давно или только потому, что сегодня всё достало?`,
        ]);
      }
      return semanticPick(context, "opinion-followup-generic", [
        `Если ты про «${prior}» — я бы не делала вид, что знаю всю ситуацию по одной фразе. Но по тому, что ты уже сказал, могу разобрать её вместе с тобой.`,
        `Если вопрос про «${prior}», то у меня пока есть только твоя сторона и немного контекста. Мнение могу дать, но без притворства, будто знаю всё.`,
        `Про «${prior}» я могу сказать, что думаю, но лучше опираться именно на то, что ты рассказал, а не додумывать детали за тебя.`,
      ]);
    }
  }

  if (context.nlu.intent === "ask_why" && /(?:ты\s+так\s+(?:ответила|сказала)|почему\s+так\s+думаешь)/u.test(current)) {
    const before = compactQuote(context.dialogueFrame.previousUserText, 88)?.replace(/[.!?]+$/u, "");
    if (before)
      return semanticPick(context, "explain-last-reply", [
        `Потому что я оттолкнулась от твоей прошлой фразы: «${before}». Я не знаю больше того, что ты сам мне рассказал.`,
        `Я так ответила из того контекста, который был перед этим — «${before}». Если я считала смысл не так, поправь меня.`,
        `Из твоей предыдущей фразы — «${before}». Это была моя интерпретация, не какой-то скрытый факт.`,
      ]);
  }

  if (context.nlu.intent === "ask_why" && /(?:почему\s+ты\s+(?:со\s+мной\s+)?споришь|зачем\s+ты\s+(?:со\s+мной\s+)?споришь)/u.test(current)) {
    return semanticPick(context, "why-disagree", [
      "Потому что я не хочу соглашаться автоматически. Если в твоей мысли вижу слабое место или сама смотрю иначе, мне честнее это сказать.",
      "Не ради самого спора. Просто если у меня получается другая позиция, я лучше покажу её, чем буду изображать удобное согласие.",
      "Потому что разговор для меня интереснее, когда у нас могут быть разные позиции. Иначе я быстро превращусь в зеркало, а не в собеседника.",
    ]);
  }

  if (context.nlu.intent === "ask_why" && /(?:поссор|поруг|друг|подруг)/u.test(previous))
    return "Если ты про ссору — я не могу знать, почему он так сделал. Могу только предполагать по тому, что ты расскажешь.";

  if (context.nlu.intent === "ask_why" && previousCharacter && context.dialogueFrame.previousUserText) {
    const priorUser = normalizeDialogueText(context.dialogueFrame.previousUserText);
    const matchedPreference = context.character.preferenceRules?.find((rule) =>
      rule.topicKeywords.some((keyword) => priorUser.includes(normalizeDialogueText(keyword))),
    );
    if (matchedPreference?.reasons?.length) {
      const reason = matchedPreference.reasons[0]
        ?.replace(/^ей\s+/u, "мне ")
        .replace(/^для неё/u, "для меня")
        .replace(/\s+ей\s+/gu, " мне ")
        .replace(/\s+её\b/gu, " моё");
      if (reason) return `Потому что ${reason}.`;
    }
    return semanticPick(context, "why-previous-reply", [
      `Если ты про мою прошлую фразу — «${previousCharacter.replace(/[.!?]+$/u, "")}» — я оттолкнулась от того, что ты сказал перед этим.`,
      `Я отвечала именно на твою прошлую мысль, а не из воздуха. Если хочешь, могу разложить, какую связь я там увидела.`,
      `Потому что я так связала твою предыдущую фразу с контекстом разговора. Если связь получилась натянутой — лучше поправь меня.`,
    ]);
  }

  if (["ask_followup", "ask_character_preference"].includes(context.nlu.intent) && preference && /(?:какие|какой|что|а ты|а тебе|у тебя|например)/u.test(current))
    return preference.fallbackText;
  if (context.nlu.intent === "clarification_request") {
    const last = compactQuote(context.dialogueFrame.previousCharacterText);
    return last
      ? `Я про свою последнюю фразу: «${last.replace(/[.!?]+$/u, "")}». Если непонятно, скажу проще.`
      : "Похоже, я криво сформулировала. Скажу проще.";
  }
  if (context.nlu.intent === "ask_why" && preference) {
    const reason = (preference.reasons[0] ?? "мне это просто ближе")
      .replace(/^ей\s+/u, "мне ")
      .replace(/^для неё/u, "для меня")
      .replace(/\s+ей\s+/gu, " мне ")
      .replace(/\s+её\b/gu, " моё");
    return `Потому что ${reason}.`;
  }
  return undefined;
}

function dedupeActs(acts: DialogueAct[]) {
  return [...new Set(acts)];
}

function mayAskQuestion(context: DialogueContext, acts: readonly DialogueAct[]) {
  if (acts.some((act) => ["SILENCE","REFUSE","BOUNDARY","GOOD_NIGHT","CHANGE_TOPIC"].includes(act))) return false;
  if (acts.includes("CLARIFY")) return true;
  if (context.nlu.intent === "unknown" && context.nlu.confidence < 0.5) return true;
  if (context.nlu.intent === "ask_for_support") return false;
  return context.dialogueFrame.turnsOnTopic < 5 && context.nlu.confidence >= 0.48 && context.perception.ambiguity < 0.7;
}

export function planLocalDialogue(
  context: DialogueContext,
  authoritativeText?: string,
): CharacterResponsePlan {
  const forced = decisionActs(context.decision);
  let acts = forced ?? intentActs(context.nlu);
  const optionalQuestion = context.responsePlan.questionMode === "direct" ||
    (context.responsePlan.questionMode === "optional" && context.decision.shouldAskFollowUp);
  if (optionalQuestion && mayAskQuestion(context, acts) && !acts.includes("CLARIFY")) acts = [...acts, "FOLLOW_UP"];
  if (context.nlu.intent === "return_after_absence" && ["close","deep"].includes(context.relationship.stage)) acts = [...acts, "MISS_USER"];
  acts = dedupeActs(acts);
  const [emotionName, emotionIntensity] = dominantEmotion(context.emotion);
  const semanticPayload: NonNullable<CharacterResponsePlan["semanticPayload"]> = {
    summary: context.decision.content.summary,
    continuation: context.dialogueFrame.previousUserText
      ? `Ты до этого говорил: «${compactQuote(context.dialogueFrame.previousUserText) ?? "это"}».`
      : "Я не потеряла нить разговора.",
    focus: context.nlu.semantic.focus,
    reason: context.nlu.semantic.reason,
    alternative: context.nlu.semantic.alternative,
    correctionFrom: context.nlu.semantic.correctionFrom,
    correctionTo: context.nlu.semantic.correctionTo,
    stance: context.nlu.semantic.stance,
  };
  const contextual = contextualAnswer(context);
  if (authoritativeText) semanticPayload.authoritativeText = authoritativeText;
  else if (contextual) semanticPayload.authoritativeText = contextual;
  if (context.decision.content.locked && context.decision.content.fallbackText !== undefined)
    semanticPayload.lockedText = context.decision.content.fallbackText;

  return {
    trigger: context.initiative ? "AUTONOMOUS_MESSAGE" : "USER_MESSAGE",
    sourceIntent: context.nlu.intent,
    dialogueActs: acts,
    goal: goalFromActs(acts),
    emotion: emotionName,
    emotionIntensity,
    tone: styleTones(context),
    relationshipLevel: context.relationship.stage,
    intimacyLevel: context.relationship.closeness,
    energy: context.emotion.energy,
    responseLength: responseLength(context.responsePlan.length),
    shouldAskQuestion: acts.includes("FOLLOW_UP") || acts.includes("CLARIFY"),
    topic: context.nlu.topic ?? context.dialogueFrame.currentTopic,
    semanticPayload,
    decision: context.decision,
    responsePlan: context.responsePlan,
  };
}

export function planAutonomousDialogue(context: DialogueContext): CharacterResponsePlan {
  const initiative = context.initiative;
  const kind = initiative?.kind;
  const acts: DialogueAct[] = kind === "continue_thread" ? ["REMEMBER","CONTINUE_TOPIC","SHARE"]
    : kind === "share_world_event" ? ["SHARE"]
      : kind === "suggest_activity" ? ["SHARE","ASK"]
        : kind === "affectionate_checkin" ? ["WELCOME_BACK","CARE"]
          : kind === "share_thought" ? ["SHARE","CURIOSITY"]
            : ["SHARE"];
  const [emotion, emotionIntensity] = dominantEmotion(context.emotion);
  return {
    trigger: "AUTONOMOUS_MESSAGE",
    sourceIntent: `initiative_${kind ?? "unknown"}`,
    dialogueActs: acts,
    goal: "share",
    emotion,
    emotionIntensity,
    tone: styleTones(context),
    relationshipLevel: context.relationship.stage,
    intimacyLevel: context.relationship.closeness,
    energy: context.emotion.energy,
    responseLength: "short",
    shouldAskQuestion: acts.includes("ASK"),
    topic: initiative?.topic,
    semanticPayload: { summary: initiative?.reason ?? "Share a small thought." },
    decision: context.decision,
    responsePlan: context.responsePlan,
  };
}

// ---- fallback-planner.ts ----
export function fallbackKey(plan: CharacterResponsePlan, context: DialogueContext) {
  if (plan.sourceIntent === "external_fact_question") return "external_fact";
  if (["memory_question", "ask_user_memory"].includes(plan.sourceIntent) && !context.memoryContext.facts.length && !context.memoryContext.memories.length)
    return "no_memory";
  if (context.nlu.confidence < 0.45) return "low_confidence";
  if (plan.sourceIntent === "unknown") return "unknown";
  if (plan.trigger === "AUTONOMOUS_MESSAGE") return "autonomous";
  return "generic";
}
