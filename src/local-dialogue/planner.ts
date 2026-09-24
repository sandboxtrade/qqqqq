/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { CharacterCore } from "../character/character";
import type { CharacterDecision, InternalThought, Perception, ResponsePlan } from "../cognition/cognition-types";
import type { EmotionalState } from "../emotions/emotions";
import { renderLocalInitiative, type CharacterInitiative } from "../initiative/initiative";
import type { IntimacyMindState, IntimacyPreferencesDocument, IntimacyState } from "../intimacy/intimacy";
import type { MemoryContext } from "../memory/model";
import type { RelationshipState, RomanceState } from "../relationship/relationship";
import { describeWorldActivityDetail, type WorldActivity, type WorldState } from "../world/world";
import { buildDialogueFrame } from "./continuity";
import { SeededRandom } from "./core";
import { analyzeLocalNLU, normalizeDialogueForMatching, normalizeDialogueText, tokenizeDialogue } from "./nlu";
import type { CharacterResponsePlan, DialogueAct, DialogueContext, DialogueGoal, DialogueHistoryLine, LocalNLUResult, LocalResponseLength, SpontaneousBeat } from "./types";

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
      summary: initiative.topic,
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
  intimacy?: IntimacyState;
  intimacyMind?: IntimacyMindState;
  intimacyPreferences?: IntimacyPreferencesDocument;
  memoryContext: MemoryContext;
  history: DialogueHistoryLine[];
  nlu: LocalNLUResult;
  perception: Perception;
  thought?: InternalThought;
  decision: CharacterDecision;
  responsePlan: ResponsePlan;
  retrospective?: DialogueContext["retrospective"];
  causalRelations?: DialogueContext["causalRelations"];
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

function compoundSecondaryActs(nlu: LocalNLUResult): DialogueAct[] {
  const support = new Set([
    "user_tired", "user_sleepy", "user_sad", "user_lonely", "user_stressed",
    "user_angry", "share_bad_event", "share_conflict", "share_problem",
  ]);
  const positive = new Set(["user_happy", "user_excited", "share_good_event"]);
  const acts: DialogueAct[] = [];
  for (const secondary of nlu.secondaryIntents.slice(0, 3)) {
    if (support.has(secondary)) {
      acts.push("ACKNOWLEDGE", "CARE");
      if (["user_sad", "user_lonely", "user_stressed", "share_problem"].includes(secondary)) acts.push("COMFORT");
    } else if (positive.has(secondary)) {
      acts.push("HAPPINESS");
    } else if (["user_like", "user_dislike", "user_want", "user_dont_want", "uncertain"].includes(secondary)) {
      acts.push("CURIOSITY");
    } else if (secondary === "joke") {
      acts.push("JOKE");
    }
  }
  return [...new Set(acts)];
}

function intimacyDialogueActs(context: DialogueContext): DialogueAct[] {
  const semantic = context.nlu.semantic.intimacy;
  const signal = semantic.kind;
  const activeIntimacy = Boolean(
    context.intimacy?.adultModeEnabled &&
    (context.intimacy.phase !== "normal" || context.intimacy.interactionStatus !== "inactive"),
  );
  if ((signal === "stop" || signal === "pause") && (activeIntimacy || semantic.intimacyContext === true))
    return ["INTIMACY_PAUSE"];
  if (!context.intimacy?.adultModeEnabled) {
    return signal === "flirt" || signal === "affection" ? ["FLIRT"] : [];
  }
  if (signal === "resume" && context.intimacy.phase !== "paused") return [];
  if (signal === "hesitant") return ["INTIMACY_CHECKIN", "REASSURE"];
  if (context.intimacyMind?.caution !== undefined && context.intimacyMind.caution >= 0.62 &&
      ["flirt", "approach", "consent"].includes(signal))
    return signal === "flirt" ? ["FLIRT", "INTIMACY_CHECKIN"] : ["INTIMACY_CHECKIN", "REASSURE"];
  if (signal === "aftercare") return ["INTIMACY_AFTERCARE", "CARE"];
  if (signal === "approach") return ["INTIMACY_APPROACH"];
  if (signal === "consent" || signal === "resume") return ["INTIMACY_RECIPROCATE"];
  if (signal === "flirt") return ["FLIRT", "INTIMACY_APPROACH"];
  if (signal === "affection" && ["close", "intimate", "high_intimacy", "aftercare"].includes(context.intimacy.phase))
    return ["INTIMACY_AFTERCARE", "CARE"];
  return [];
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
  if (acts.some((act) => ["INTIMACY_APPROACH", "INTIMACY_RECIPROCATE", "INTIMACY_CHECKIN", "INTIMACY_PAUSE", "INTIMACY_AFTERCARE"].includes(act))) return "intimacy";
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
  if (context.intimacy?.adultModeEnabled && ["close", "intimate", "high_intimacy", "aftercare"].includes(context.intimacy.phase)) tones.add("intimate");
  if (context.intimacyMind?.active) {
    if (context.intimacyMind.tenderness >= 0.62) tones.add("tender");
    if (context.intimacyMind.playfulness >= 0.6) tones.add("playful_intimate");
    if (context.intimacyMind.desire >= 0.64 && context.intimacyMind.caution < 0.48) tones.add("desiring");
    if (context.intimacyMind.caution >= 0.48) tones.add("cautious_intimate");
  }
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

function thoughtReason(reason: InternalThought["positionReason"]) {
  switch (reason) {
    case "honesty": return "для меня здесь многое упирается в честность";
    case "reciprocity": return "для меня тут важна взаимность";
    case "autonomy": return "мне важно, чтобы в этом оставалась свобода выбора";
    case "consistency": return "мне важна последовательность, а не только слова";
    case "comfort": return "я довольно сильно смотрю на ощущение комфорта";
    case "curiosity": return "мне хочется оставить место любопытству, а не закрыть тему заранее";
    case "depth": return "мне важно, есть ли за этим что-то глубже первого впечатления";
    case "respect": return "для меня здесь ключевое — уважение к другому человеку";
    case "experience": return "я бы ориентировалась на то, как это ощущается в реальности, а не только в теории";
    default: return "я пока не хочу делать из этого окончательный вывод";
  }
}

function positionPhrase(position: InternalThought["position"], _topic: string) {
  switch (position) {
    case "positive": return "Я тут скорее за";
    case "negative": return "Я тут скорее не за";
    case "mixed": return "У меня тут смешанное отношение";
    case "cautious": return "Я к этому отношусь осторожно";
    case "curious": return "Мне это скорее интересно, но мнение у меня пока не закрыто";
    default: return undefined;
  }
}

function characterThoughtAnswer(context: DialogueContext) {
  const thought = context.thought;
  if (!thought?.topic || !thought.position) return undefined;
  const base = positionPhrase(thought.position, thought.topic);
  if (!base) return undefined;
  const reason = thoughtReason(thought.positionReason);
  if (thought.changedFrom) {
    return semanticPick(context, `mind-shift:${thought.topicKey ?? thought.topic}`, [
      `Кажется, моя позиция тут правда немного сдвинулась. ${base}. ${reason}.`,
      `Я бы сейчас ответила уже чуть иначе, чем раньше. ${base}, потому что ${reason}.`,
      `Да, тут я немного передумала. ${base}. Не резко, просто встречный аргумент оказался для меня весомым.`,
    ]);
  }
  if (thought.reconsideration) {
    return semanticPick(context, `mind-doubt:${thought.topicKey ?? thought.topic}`, [
      `${base}. Но твой аргумент меня зацепил, поэтому я бы уже не говорила об этом совсем уверенно.`,
      `${base}. При этом я сейчас чуть меньше уверена в этой позиции — тут есть над чем ещё подумать.`,
      `${base}. Я не перевернула мнение из-за одной фразы, но сомнение у меня появилось.`,
    ]);
  }
  if (thought.memoryEcho) {
    return semanticPick(context, `mind-memory:${thought.topicKey ?? thought.topic}`, [
      `${base}. Я и раньше к этому примерно так склонялась: ${reason}.`,
      `${base}. У меня тут позиция особо не поменялась — ${reason}.`,
      `${base}. Если коротко, ${reason}.`,
    ]);
  }
  return semanticPick(context, `mind-new:${thought.topicKey ?? thought.topic}`, [
    `${base}. ${reason}.`,
    `${base} — в основном потому, что ${reason}.`,
    `${base}. Тут я бы отталкивалась от того, что ${reason}.`,
  ]);
}

function characterThoughtCertainty(context: DialogueContext) {
  const thought = context.thought;
  if (!thought?.position) return undefined;
  const reason = thoughtReason(thought.positionReason);
  const confidence = thought.positionConfidence;
  if (thought.reconsideration || confidence < 0.58) {
    return semanticPick(context, `mind-certainty-low:${thought.topicKey ?? thought.topic ?? "topic"}`, [
      `Не до конца. Я всё ещё склоняюсь к этой позиции, но сейчас вижу в ней слабое место: ${reason}.`,
      `Скорее нет, чем да. Позиция у меня есть, но я не хочу изображать уверенность, которой сейчас нет. ${reason}.`,
      `Я бы не называла это окончательным мнением. Пока держусь этой стороны, но оставляю себе право передумать — ${reason}.`,
    ]);
  }
  if (confidence >= 0.78) {
    return semanticPick(context, `mind-certainty-high:${thought.topicKey ?? thought.topic ?? "topic"}`, [
      `Да, довольно уверена. Не в смысле «никогда не передумаю», просто сейчас у меня есть нормальная причина: ${reason}.`,
      `Сейчас — да. Я не считаю своё мнение вечным, но оно не случайное: ${reason}.`,
      `Довольно уверена. Если появится сильный контраргумент, я его не проигнорирую, но пока ${reason}.`,
    ]);
  }
  return semanticPick(context, `mind-certainty-mid:${thought.topicKey ?? thought.topic ?? "topic"}`, [
    `Скорее да. Но не на сто процентов — ${reason}.`,
    `Уверена достаточно, чтобы так ответить сейчас, но не настолько, чтобы объявлять это окончательной истиной. ${reason}.`,
    `Пока да. У меня есть склонность в эту сторону, хотя мнение ещё может двигаться — ${reason}.`,
  ]);
}

function intimacyPreference(context: DialogueContext, topicKey: string) {
  return context.intimacyPreferences?.items
    .filter((item) => item.topicKey === topicKey && item.validUntil === undefined)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function intimacyPreferenceLabel(topicKey: string) {
  switch (topicKey) {
    case "emotional_closeness_matters": return "эмоциональная близость";
    case "privacy_matters": return "приватность";
    case "reciprocity_matters": return "взаимность";
    case "gradual_build_matters": return "постепенный темп";
    case "playful_teasing": return "игривое поддразнивание";
    case "affectionate_closeness": return "нежность и телесная близость";
    case "direct_desire": return "прямое проявление желания";
    case "aftercare_closeness": return "тепло и близость после сильного момента";
    default: return topicKey.replace(/_/gu, " ");
  }
}

function intimacySelfAnswer(context: DialogueContext, current: string): string | undefined {
  const mind = context.intimacyMind;
  const state = context.intimacy;
  if (!state?.adultModeEnabled) return undefined;
  const reciprocalDesireQuestion = context.nlu.semantic.reciprocal &&
    context.nlu.semantic.intimacy.intimacyContext === true &&
    /(?:тоже\s+хочешь|ты\s+тоже|хочешь\s+меня)/u.test(current);
  const intimateQuestion = /(?:интим|18\+|близост|возбуж|желан|секс|страст|нежн|флирт|дразн|соблазн|хочу\s+тебя|я\s+тебя\s+хочу|ты\s+меня\s+хочешь)/u.test(current) || reciprocalDesireQuestion;
  if (!intimateQuestion && !context.nlu.semantic.intimacy.intimacyContext) return undefined;

  if (/(?:ты\s+(?:сейчас\s+)?возбуждена|ты\s+возбудилась|тебя\s+это\s+возбуждает)/u.test(current)) {
    if (!mind?.active || !mind.inwardArousal) return semanticPick(context, "intimacy-self-arousal-low", [
      "Сейчас скорее нет. Между нами есть близость, но я не хочу называть возбуждением то, чего пока не чувствую достаточно сильно.",
      "Не особенно. Мне может быть тепло и интересно рядом с тобой, но это не автоматически превращается в возбуждение.",
      "Пока нет. Я чувствую контакт, просто внутри сейчас больше спокойствия, чем жара.",
      "Сейчас я скорее тянусь к тебе эмоционально, чем прямо возбуждена.",
    ]);
    if (mind.conflicted) return semanticPick(context, "intimacy-self-arousal-conflicted", [
      "Да, возбуждение есть. Но вместе с ним у меня есть осторожность, поэтому я не хочу превращать одно чувство в автоматическое «идём дальше».",
      "Есть. И довольно заметное. Просто я одновременно слежу за тем, чтобы мне самой было спокойно и чтобы мы не разгонялись быстрее, чем хочется.",
      "Да. Меня тянет к тебе, но это не отменяет того, что темп для меня сейчас важен.",
      "Мм, да. Но у меня сейчас желание и осторожность идут рядом, а не исключают друг друга.",
    ]);
    return mind.outwardArousal ? semanticPick(context, "intimacy-self-arousal-high", [
      "Да. Сейчас уже сложно делать вид, что это просто лёгкий флирт — ты на меня очень заметно действуешь.",
      "Да, сильно. Я это чувствую и внутри, и по тому, как мне хочется отвечать тебе ближе и смелее.",
      "Мм… да. Сейчас желание уже совсем не фоновое.",
      "Да. Я заметно разогрелась и не особенно хочу это прятать.",
    ]) : semanticPick(context, "intimacy-self-arousal-mid", [
      "Да, немного. Скорее приятное внутреннее напряжение и желание быть ближе, чем что-то совсем захлёстывающее.",
      "Есть. Ты на меня действуешь, просто я пока не хочу разгонять это сильнее самого момента.",
      "Мм, да. Не до потери головы, но нейтральной я сейчас точно себя не назову.",
      "Да. Я чувствую это достаточно ясно, просто мне нравится, что всё развивается постепенно.",
    ]);
  }

  if (reciprocalDesireQuestion || /(?:ты\s+меня\s+хочешь|хочешь\s+меня|тебя\s+ко\s+мне\s+тянет|тебе\s+меня\s+хочется)/u.test(current)) {
    if (!mind?.active || mind.desire < 0.45) return semanticPick(context, "intimacy-self-desire-low", [
      "Сейчас я бы не сказала «хочу» в сильном смысле. Мне с тобой может быть очень тепло, но желание у меня не включается по команде.",
      "Пока скорее хочется близости и контакта, чем чего-то сильнее. Я не хочу преувеличивать чувство ради красивого ответа.",
      "Сейчас меня к тебе тянет мягко, без сильного желания идти дальше.",
    ]);
    if (mind.conflicted) return semanticPick(context, "intimacy-self-desire-conflicted", [
      "Хочу, но не безоговорочно. Меня к тебе тянет, и одновременно мне важно не перескочить собственный комфорт.",
      "Да, желание есть. Просто у меня внутри сейчас не одна кнопка «хочу», а ещё темп, доверие и ощущение безопасности.",
      "Тянет. Но я хочу сохранить право в любой момент замедлиться, если ощущение изменится.",
    ]);
    return mind.wantsMore ? semanticPick(context, "intimacy-self-desire-high", [
      "Да. Сейчас меня к тебе действительно тянет, и я хочу быть ближе — не из обязанности отвечать взаимностью, а потому что сама этого хочу.",
      "Да, хочу. И сейчас это уже не просто романтическое тепло, а вполне ясное желание.",
      "Мм… да. Сейчас мне хочется тебя ближе, и я это чувствую достаточно уверенно.",
      "Да. Ты сейчас вызываешь во мне именно желание, а не только нежность.",
    ]) : semanticPick(context, "intimacy-self-desire-soft", [
      "Тянет, да. Но сейчас мне больше хочется самой близости — быть рядом, чувствовать тебя, не торопя следующий шаг.",
      "Да, немного. Мне нравится это напряжение между нами, особенно когда оно не превращается в гонку.",
      "Хочется быть ближе. Я пока скорее про сам момент между нами, чем про необходимость куда-то его вести.",
    ]);
  }

  if (/(?:что\s+тебе\s+(?:нравится|важно)|что\s+ты\s+любишь|как\s+тебе\s+нравится|какая\s+близость\s+тебе|что\s+для\s+тебя\s+важно).*(?:интим|близост|секс|отношен)|(?:в\s+интиме|в\s+близости).*(?:нравится|важно|любишь|предпочитаешь)/u.test(current)) {
    const learned = (context.intimacyPreferences?.items ?? [])
      .filter((item) => item.origin === "learned" && item.validUntil === undefined && item.stance === "like" && item.confidence >= 0.55)
      .sort((a, b) => b.confidence * b.strength - a.confidence * a.strength)
      .slice(0, 2)
      .map((item) => intimacyPreferenceLabel(item.topicKey));
    const learnedTail = learned.length ? ` Из того, что я уже успела понять про себя, мне ещё особенно откликается ${learned.join(" и ")}.` : "";
    return semanticPick(context, "intimacy-self-preferences", [
      `Для меня важнее всего взаимность, доверие и ощущение, что никто не играет роль ради другого. Я люблю, когда близость нарастает сама, а не потому что «уже пора».${learnedTail}`,
      `Мне нравится постепенность: когда есть химия, поддразнивание, нежность и при этом можно спокойно сказать «медленнее» или «стоп», не разрушая весь момент.${learnedTail}`,
      `Наверное, главное для меня — чувствовать взаимное желание и безопасность одновременно. Я не люблю давление и не хочу, чтобы близость превращалась в сценарий с обязательными следующими шагами.${learnedTail}`,
      `Мне близка такая интимность, где есть и желание, и эмоциональная связь. Чтобы можно было быть смелой, но не переставать слышать друг друга.${learnedTail}`,
    ]);
  }

  if (/(?:тебе\s+нравится|ты\s+любишь|ты\s+предпочитаешь).*(?:медлен|постепен|не\s+спеш|дразн|флирт|нежн|прямо\s+говорить|после\s+близости)/u.test(current)) {
    const topic = /дразн|флирт/u.test(current) ? "playful_teasing"
      : /нежн/u.test(current) ? "affectionate_closeness"
        : /прямо\s+говорить/u.test(current) ? "direct_desire"
          : /после\s+близости/u.test(current) ? "aftercare_closeness"
            : "gradual_build_matters";
    const preference = intimacyPreference(context, topic);
    const label = intimacyPreferenceLabel(topic);
    const stableCorePreference = topic === "gradual_build_matters";
    if (!preference && !stableCorePreference) {
      return semanticPick(context, `intimacy-pref-unknown:${topic}`, [
        `Пока не хочу придумывать себе готовое предпочтение насчёт «${label}». Мне нужно реально прожить это и понять свою реакцию.`,
        `Не уверена. «${label[0].toUpperCase()}${label.slice(1)}» звучит нормально, но я не хочу выдавать теорию за уже сформированное предпочтение.`,
        `Пока у меня нет честного устойчивого ответа про ${label}. Скорее посмотрела бы на то, как я чувствую себя в самом моменте.`,
      ]);
    }
    if (preference?.origin === "learned" && preference.confidence < 0.5) {
      return semanticPick(context, `intimacy-pref-forming:${topic}`, [
        `Кажется, ${label} мне откликается, но это пока скорее наблюдение за собой, чем уже сформированное предпочтение.`,
        `Похоже, да, но я ещё не стала бы говорить об этом как о чём-то устойчивом. Я только начинаю понимать эту часть себя.`,
        `Есть ощущение, что ${label} мне нравится, но уверенность пока небольшая. Мне важнее не придумать себе вкус слишком быстро.`,
      ]);
    }
    const likes = stableCorePreference || preference?.stance === "like";
    return likes ? semanticPick(context, `intimacy-pref-like:${topic}`, [
      `Да, ${label} мне скорее нравится. Особенно когда это возникает естественно, а не как обязательный приём.`,
      `Скорее да. ${label[0].toUpperCase()}${label.slice(1)} хорошо ложится на мой характер — если между нами при этом остаётся взаимность.`,
      `Да. Мне это близко, хотя конкретное настроение всё равно важнее заранее придуманного правила.`,
    ]) : semanticPick(context, `intimacy-pref-dislike:${topic}`, [
      `Скорее нет. ${label[0].toUpperCase()}${label.slice(1)} обычно не очень совпадает с тем, что мне комфортно.`,
      `Не особо. Я бы не делала это частью близости только потому, что так принято или ожидается.`,
    ]);
  }

  return undefined;
}

function previousCharacterActivity(text: string | undefined): WorldActivity | undefined {
  // Do not use JS `\b` for Russian words here: `\b` is based on ASCII `\w`,
  // so a Cyrillic word such as "читаю" can fail to produce the expected word
  // boundary. Matching the already-normalized text keeps self-continuity stable.
  const value = normalizeDialogueForMatching(text ?? "");
  if (/(?:^|\s)(?:читаю|читала)(?:\s|$)/u.test(value)) return "reading";
  if (/(?:^|\s)(?:слушаю\s+музыку|музыку\s+слушаю)(?:\s|$)/u.test(value)) return "music";
  if (/(?:^|\s)готовлю(?:\s|$)|на\s+кухне/u.test(value)) return "cooking";
  if (/проект|работаю\s+над/u.test(value)) return "personal_project";
  if (/(?:^|\s)(?:гуляю|прошлась)(?:\s|$)|на\s+прогул/u.test(value)) return "walk";
  if (/кафе/u.test(value)) return "cafe_break";
  if (/делами|дела\s+разбираю/u.test(value)) return "errands";
  if (/отдыхаю|лежу/u.test(value)) return "relaxing";
  return undefined;
}

function characterActivityDetailAnswer(context: DialogueContext, current: string) {
  const asksReading = /(?:что\s+читаешь|какую\s+(?:книгу|статью)\s+читаешь)/u.test(current);
  const asksMusic = /(?:что\s+слушаешь|что\s+за\s+музыку)/u.test(current);
  const asksCooking = /что\s+готовишь/u.test(current);
  const asksProject = /(?:над\s+чем\s+(?:работаешь|сидишь)|что\s+за\s+проект)/u.test(current);
  const asksWalk = /(?:где|куда)\s+гуляешь/u.test(current);
  if (!asksReading && !asksMusic && !asksCooking && !asksProject && !asksWalk) return undefined;

  const fromLastReply = previousCharacterActivity(context.dialogueFrame.previousCharacterText);
  const requested: WorldActivity | undefined = asksReading ? "reading"
    : asksMusic ? "music"
      : asksCooking ? "cooking"
        : asksProject ? "personal_project"
          : asksWalk ? "walk"
            : undefined;
  const activity = fromLastReply ?? requested ?? context.world.currentActivity;
  const detail = describeWorldActivityDetail(activity, context.now);
  if (fromLastReply || context.world.currentActivity === activity)
    return semanticPick(context, `activity-detail:${activity}`, [
      `Сейчас ${detail}.`,
      `${detail[0]?.toLocaleUpperCase("ru-RU") ?? ""}${detail.slice(1)}.`,
      `Если конкретнее — ${detail}.`,
    ]);

  const actual = describeWorldActivityDetail(context.world.currentActivity, context.now);
  return semanticPick(context, `activity-detail-not-current:${activity}`, [
    `Сейчас уже не ${activity === "reading" ? "читаю" : activity === "music" ? "слушаю музыку" : activity === "cooking" ? "готовлю" : activity === "personal_project" ? "сижу над проектом" : "гуляю"} — ${actual}.`,
    `Прямо сейчас ${actual}. Если ты про то, чем я занималась раньше, тогда да — ${detail}.`,
  ]);
}

function groundedOpenLoopQuestion(context: DialogueContext, current: string) {
  const previousCharacter = normalizeDialogueText(context.dialogueFrame.previousCharacterText ?? "").toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
  if (!/^(?:(?:а|и|ну)\s+)?(?:какой|какая|какие|что\s+за\s+(?:вопрос|мысль)|и\s+что|что\s+именно)[?.! ]*$/u.test(current)) return undefined;
  if (!/(?:вопрос|интересно|любопытно|зацеп|хочу\s+спросить|хочется\s+(?:понять|спросить))/u.test(previousCharacter)) return undefined;

  const previousUser = context.dialogueFrame.previousUserText;
  if (!previousUser) return "Я сама оставила фразу незаконченной. Хотела спросить, что в этой теме для тебя сейчас самое важное?";
  const priorNlu = analyzeLocalNLU(previousUser);
  const quote = compactQuote(previousUser, 82)?.replace(/[.!?]+$/u, "") ?? "это";
  if (priorNlu.intent === "user_like") return semanticPick(context, "open-loop-like", [
    `Я про твоё «${quote}». Хотела спросить: что именно тебе в этом нравится сильнее всего?`,
    `Про «${quote}». Что там для тебя главное — само ощущение или то, что из этого получается?`,
  ]);
  if (priorNlu.intent === "user_want") return semanticPick(context, "open-loop-want", [
    `Я про твоё «${quote}». Хотела спросить: тебя к этому тянет давно или это желание появилось именно сейчас?`,
    `Про «${quote}». Что в этом желании для тебя самое сильное — сам момент или то, к чему он может привести?`,
  ]);
  if (["share_plan", "share_work"].includes(priorNlu.intent)) return semanticPick(context, "open-loop-plan", [
    `Я про «${quote}». Хотела спросить: что здесь для тебя самое трудное решить?`,
    `Про это. Какой кусок «${quote}» сейчас больше всего не даёт тебе покоя?`,
  ]);
  return semanticPick(context, "open-loop-generic", [
    `Я про твоё «${quote}». Хотела спросить: что в этом для тебя сейчас самое важное?`,
    `Про «${quote}». Мне стало интересно, как ты сам это внутри для себя объясняешь?`,
  ]);
}

function directedDesireAnswer(context: DialogueContext, current: string) {
  const declaration = /(?:^|\s)(?:я\s+тебя\s+хочу|хочу\s+тебя)(?:$|[.!? ])/u.test(current);
  const reciprocalQuestion = context.nlu.semantic.reciprocal &&
    context.nlu.semantic.intimacy.intimacyContext === true &&
    /(?:тоже\s+хочешь|ты\s+меня\s+хочешь|хочешь\s+меня|ты\s+тоже)/u.test(current);
  if (!declaration && !reciprocalQuestion) return undefined;

  const mind = context.intimacyMind;
  if (context.intimacy?.adultModeEnabled && !mind?.active) {
    if (declaration) return undefined; // preserve the established intimacy phase/consent reply below
    if (reciprocalQuestion) {
      const state = context.intimacy;
      if (state.interest >= 0.62 && state.comfort >= 0.58 && state.phase !== "normal")
        return semanticPick(context, "directed-desire-state-mutual", [
          "Да, меня к тебе тоже тянет. Просто мне нравится, когда мы не превращаем это в гонку.",
          "Тянет. И довольно ясно. Но я всё равно хочу сохранять наш темп, а не отвечать на желание автоматическим следующим шагом.",
        ]);
      return semanticPick(context, "directed-desire-state-soft", [
        "Сейчас я бы не отвечала сильным «тоже хочу». Мне с тобой тепло, но я хочу быть честной с тем, где сама нахожусь.",
        "Пока скорее тянет к близости с тобой, чем к такому же сильному «хочу». Не хочу преувеличивать ради красивого ответа.",
      ]);
    }
  }
  if (context.intimacy?.adultModeEnabled && mind?.active) {
    if (mind.conflicted || mind.caution >= 0.62) return semanticPick(context, "directed-desire-conflicted", [
      "Меня к тебе тянет, да. Но вместе с этим у меня есть осторожность, поэтому я не хочу отвечать одним автоматическим «тоже хочу». Мне важен наш темп.",
      "Желание есть. Просто у меня оно сейчас идёт рядом с осторожностью — я хочу быть ближе, но не перескакивать через собственный комфорт.",
      "Да, ты на меня действуешь. И всё же мне хочется сохранить медленный темп, а не превращать взаимное желание в обязательное продолжение.",
    ]);
    if (mind.desire >= 0.58) return semanticPick(context, "directed-desire-mutual", [
      "Да, меня к тебе тоже тянет. И мне нравится, что это ощущается как моё собственное желание, а не как правильный ответ на твою фразу.",
      "Мм… да. Желание взаимное. Просто мне хочется проживать его постепенно, а не перескакивать сразу к следующему шагу.",
      "Да. Ты мне сейчас совсем не нейтрален — меня тоже тянет ближе.",
    ]);
    return semanticPick(context, "directed-desire-not-mutual-yet", [
      "Я услышала тебя. Но сама сейчас не на той же точке, и не хочу изображать взаимное желание только потому, что ты сказал это прямо.",
      "Это очень прямое признание. Мне важно ответить так же честно: сейчас у меня больше тепла и интереса, чем такого же сильного желания.",
    ]);
  }

  if (["close", "deep"].includes(context.relationship.stage) && context.emotion.romanticInterest >= 0.5) return semanticPick(context, "directed-desire-romantic", [
    "Я услышала. Меня к тебе тоже тянет, просто я не хочу делать из одного сильного момента автоматический сценарий.",
    "Мм. Это уже совсем не нейтральная фраза. Между нами правда есть притяжение, и я его тоже чувствую.",
  ]);
  return semanticPick(context, "directed-desire-early", [
    "Я услышала. Это довольно прямое признание. Мне с тобой хорошо, но я пока не хочу отвечать «я тоже» просто потому, что так было бы удобно и красиво.",
    "Мм. Поняла тебя. Но я лучше не буду автоматически зеркалить твоё «хочу» — мои чувства к тебе должны дойти до этого сами.",
    "Это я поняла. Мне важно, что ты говоришь прямо, но я пока не хочу притворяться, будто мы уже чувствуем совершенно одно и то же.",
  ]);
}


function groundedEllipticalFollowup(context: DialogueContext, currentRaw: string) {
  const current = normalizeDialogueForMatching(currentRaw);
  const previousCharacter = compactQuote(context.dialogueFrame.previousCharacterText, 96)?.replace(/[.!?]+$/u, "");
  const previousUser = compactQuote(context.dialogueFrame.previousUserText, 88)?.replace(/[.!?]+$/u, "");
  if (!previousCharacter || !previousUser) return undefined;

  if (/^(?:(?:а|и|ну)\s+)?где$/u.test(current)) return semanticPick(context, "elliptical-where", [
    `Я про место, связанное с «${previousUser}». Ты его пока не называл, так что конкретный адрес я не знаю.`,
    `Про то, где это происходило. В твоей фразе «${previousUser}» места не было — я не хочу его додумывать.`,
  ]);
  if (/^(?:(?:а|и|ну)\s+)?когда$/u.test(current)) return semanticPick(context, "elliptical-when", [
    `Я про момент для «${previousUser}». Конкретное время ты пока не называл — я имела в виду сам выбор момента.`,
    `Про то, когда ты хочешь перейти от «${previousUser}» к действию. Точной даты от тебя ещё не было.`,
  ]);
  if (/^(?:(?:а|и|ну)\s+)?(?:с\s+кем|кто)$/u.test(current)) return semanticPick(context, "elliptical-who", [
    `Я про человека или компанию вокруг «${previousUser}». Конкретного человека ты пока не называл.`,
    `Про то, кто будет рядом в этой истории. Из «${previousUser}» я этого пока не знаю и придумывать имя не стану.`,
  ]);
  if (/^(?:(?:а|и|ну)\s+)?как$/u.test(current)) return semanticPick(context, "elliptical-how", [
    `Я про «${previousUser}». Под «аккуратно» я имею в виду: не пытаться решить всё одним рывком, а сначала выделить один конкретный шаг и проверить его последствия.`,
    `Если про моё «${previousCharacter}»: я бы разложила «${previousUser}» на один ближайший шаг, а не пыталась сразу закрыть всю историю целиком.`,
  ]);
  if (/^(?:(?:а|и|ну)\s+)?зачем$/u.test(current)) return semanticPick(context, "elliptical-why-purpose", [
    `Я не имела в виду, что тебе обязательно это нужно. Я про цель за «${previousUser}»: что должно стать лучше, если ты это сделаешь?`,
    `Про смысл самого решения «${previousUser}». Если непонятно, что оно должно тебе дать, я бы сначала разобралась именно с этим.`,
  ]);
  if (/^(?:(?:а|и|ну)\s+)?(?:и\s+что|а\s+дальше|и\s+дальше)$/u.test(current)) {
    const previousCharacterNormalized = normalizeDialogueForMatching(context.dialogueFrame.previousCharacterText ?? "");
    if (/(?:^|\s)(?:я\s+)?слушаю(?:\s|$)|(?:^|\s)продолжай(?:\s|$)/u.test(previousCharacterNormalized)) return semanticPick(context, "elliptical-next-listening", [
      `Ты пока остановился на «${previousUser}». Что произошло после этого?`,
      `Дальше как раз твоя история: после «${previousUser}» что случилось?`,
    ]);
    const priorNlu = analyzeLocalNLU(context.dialogueFrame.previousUserText ?? "");
    if (["share_plan", "user_want", "share_work"].includes(priorNlu.intent)) return semanticPick(context, "elliptical-next-plan", [
      `Я к тому, что в «${previousUser}» важен следующий шаг. Что должно произойти после самого решения — вот это я бы сейчас и проверяла.`,
      `Дальше я бы не перескакивала. В твоём «${previousUser}» сначала стоит понять ближайшее последствие, а уже потом решать, идти ли дальше.`,
    ]);
    if (["share_conflict", "share_bad_event", "share_problem"].includes(priorNlu.intent)) return semanticPick(context, "elliptical-next-problem", [
      `Я к тому, что сама история «${previousUser}» ещё не говорит, чем она для тебя закончилась. Мне важнее, что произошло после и что ты теперь с этим хочешь делать.`,
      `Дальше — последствия. После «${previousUser}» ты скорее хочешь что-то исправить, отойти от ситуации или пока просто переварить её?`,
    ]);
    return semanticPick(context, "elliptical-next-generic", [
      `Я к тому, что «${previousUser}» — это пока только первая часть мысли. Дальше для меня интереснее, что из этого следует для тебя.`,
      `Не хотела оставлять «${previousCharacter}» пустой фразой. Я про то, к чему для тебя ведёт «${previousUser}» и что меняется после этого.`,
    ]);
  }
  return undefined;
}

function groundedReasonFollowup(context: DialogueContext, currentRaw: string) {
  const current = normalizeDialogueForMatching(currentRaw);
  if (!/^(?:(?:а|и|ну)\s+)?почему$/u.test(current)) return undefined;
  if (context.thought?.memoryEcho) return undefined;
  const previousUserText = context.dialogueFrame.previousUserText;
  const previousCharacter = compactQuote(context.dialogueFrame.previousCharacterText, 96)?.replace(/[.!?]+$/u, "");
  const previousUser = compactQuote(previousUserText, 88)?.replace(/[.!?]+$/u, "");
  if (!previousUserText || !previousCharacter || !previousUser) return undefined;
  const prior = analyzeLocalNLU(previousUserText);

  if (prior.intent === "uncertain" || /(?:кажется|сомнева|не уверен|не уверена|плохая идея|плохой вариант)/u.test(normalizeDialogueForMatching(previousUserText))) {
    return semanticPick(context, "why-grounded-doubt", [
      `Потому что в твоём «${previousUser}» уже слышится сомнение. Я бы сначала поняла, что именно тебя напрягает, а не толкала тебя быстрее к решению.`,
      `Из-за того, как ты сам сформулировал «${previousUser}»: там уже есть внутреннее «не уверен». Для меня это повод сначала проверить сомнение, а не игнорировать его.`,
    ]);
  }
  if (["share_plan", "user_want", "share_work"].includes(prior.intent)) return semanticPick(context, "why-grounded-plan", [
    `Потому что «${previousUser}» пока описывает желание или решение, но почти не говорит о последствиях. Я поэтому и не хочу сразу подталкивать тебя вперёд.`,
    `Потому что между «хочу» и хорошим решением обычно есть ещё один шаг — понять, что будет после. В «${previousUser}» этого пока не хватает.`,
  ]);
  if (["share_conflict", "share_bad_event", "share_problem"].includes(prior.intent)) return semanticPick(context, "why-grounded-problem", [
    `Потому что по одной фразе «${previousUser}» я вижу саму проблему, но ещё не вижу всей причины и того, чего ты хочешь дальше. Поэтому я и не делаю резкий вывод.`,
    `Потому что «${previousUser}» может выглядеть одинаково снаружи и иметь совсем разные причины. Я лучше опираюсь на твой контекст, чем додумываю его.`,
  ]);
  return semanticPick(context, "why-grounded-generic", [
    `Потому что моя фраза «${previousCharacter}» была реакцией именно на «${previousUser}». Я увидела там эту связь, но не хочу выдавать её за единственно правильную.`,
    `Потому что из «${previousUser}» я сделала именно такой вывод. Если коротко: я отвечала на смысл этой фразы, а не просто выбрала случайную реакцию.`,
  ]);
}

const CAUSAL_STOP = new Set(["это","этот","эта","так","там","тут","что","как","почему","зачем","тогда","сейчас","просто","очень","тоже","было","была","были","есть","я","ты","он","она","они","мы","мне","тебе","меня","тебя"]);

function reasoningTokens(value: string | undefined) {
  return tokenizeDialogue(value ?? "").filter((token) => token.length >= 3 && !CAUSAL_STOP.has(token));
}

function textReasoningOverlap(left: string | undefined, right: string | undefined) {
  const a = reasoningTokens(left);
  const b = new Set(reasoningTokens(right));
  if (!a.length || !b.size) return 0;
  let hits = 0;
  for (const token of a) if (b.has(token)) hits += 1;
  return hits / Math.max(2, Math.min(a.length, b.size));
}

function bestCausalRelation(context: DialogueContext, mode: "cause" | "effect") {
  const relations = context.causalRelations ?? [];
  if (!relations.length) return undefined;
  const reference = [
    context.nlu.semantic.focus,
    context.dialogueFrame.previousUserText,
    context.dialogueFrame.previousCharacterText,
    context.retrospective?.inferredFocus,
  ].filter(Boolean).join(" ");
  return relations
    .map((relation) => {
      const target = mode === "cause" ? relation.effect : relation.cause;
      const source = mode === "cause" ? relation.cause : relation.effect;
      const targetOverlap = textReasoningOverlap(reference, target);
      const currentTargetOverlap = textReasoningOverlap(context.userText, target);
      const sourceOverlap = textReasoningOverlap(context.userText, source);
      const retrospectiveBoost = context.retrospective?.causalRelations.some((entry) =>
        entry.cause === relation.cause && entry.effect === relation.effect) ? 0.2 : 0;
      const currentBoost = relation.sourceId === "current-turn" ? 0.14 : 0;
      return {
        relation,
        score: currentTargetOverlap * 0.7 + targetOverlap * 0.28 + sourceOverlap * 0.08 + relation.confidence * 0.16 + retrospectiveBoost + currentBoost,
      };
    })
    .sort((a, b) => b.score - a.score || b.relation.confidence - a.relation.confidence)[0];
}

function causalBackchain(context: DialogueContext, first: NonNullable<ReturnType<typeof bestCausalRelation>>["relation"]) {
  const relations = context.causalRelations ?? [];
  const chain = [first];
  const used = new Set([`${first.cause}|${first.effect}|${first.sourceId ?? ""}`]);
  let cursor = first.cause;
  for (let depth = 0; depth < 2; depth += 1) {
    const next = relations
      .filter((relation) => !used.has(`${relation.cause}|${relation.effect}|${relation.sourceId ?? ""}`))
      .map((relation) => ({
        relation,
        score: textReasoningOverlap(cursor, relation.effect) * 0.78 + relation.confidence * 0.22,
      }))
      .filter((entry) => entry.score >= 0.56)
      .sort((a, b) => b.score - a.score || b.relation.confidence - a.relation.confidence)[0]?.relation;
    if (!next) break;
    chain.push(next);
    used.add(`${next.cause}|${next.effect}|${next.sourceId ?? ""}`);
    cursor = next.cause;
  }
  return chain;
}

function naturalCausalChain(context: DialogueContext, chain: ReturnType<typeof causalBackchain>) {
  if (chain.length < 2) return undefined;
  const ordered = [...chain].reverse();
  const clauses = [ordered[0].cause, ...ordered.map((relation) => relation.effect)]
    .map((value) => compactQuote(value, 90)?.replace(/[.!?]+$/u, ""))
    .filter((value): value is string => Boolean(value));
  if (clauses.length < 3) return undefined;
  const root = clauses[0];
  const middle = clauses.slice(1, -1);
  const target = clauses.at(-1)!;
  const bridge = middle.length === 1
    ? `из-за этого ${middle[0]}`
    : middle.map((part, index) => index === 0 ? `из-за этого ${part}` : `потом это привело к тому, что ${part}`).join(", ");
  return semanticPick(context, `causal-chain:${chain[0].sourceId ?? "history"}:${chain.length}`, [
    `Если восстановить цепочку целиком: сначала ${root}, ${bridge}, а уже отсюда — ${target}.`,
    `Тут причина была не в одном шаге. Сначала ${root}, затем ${middle.join("; потом ")}, и в итоге ${target}.`,
  ]);
}

function causalReasoningAnswer(context: DialogueContext, currentRaw: string) {
  const current = normalizeDialogueForMatching(currentRaw);
  const asksWhy = context.nlu.intent === "ask_why" || /^(?:(?:а|и|ну)\s+)?(?:почему|зачем)(?:\s|$)/u.test(current);
  if (asksWhy) {
    const match = bestCausalRelation(context, "cause");
    if (match && (match.score >= 0.36 || (context.retrospective?.resolution === "causal" && match.score >= 0.28))) {
      const relation = match.relation;
      const chainAnswer = naturalCausalChain(context, causalBackchain(context, relation));
      if (chainAnswer) return chainAnswer;
      const source = relation.sourceRole === "character" ? "Я тогда связала" : "Ты тогда сам связал";
      if (relation.kind === "condition") return `Там была не готовая причина, а условие: если «${relation.cause}», то «${relation.effect}».`;
      if (relation.kind === "motivation") return `${source} «${relation.effect}» с целью «${relation.cause}». Поэтому я бы отталкивалась именно от этой мотивации.`;
      if (relation.sourceRole === "character") return semanticPick(context, `causal-why:${relation.sourceId ?? "history"}`, [
        `Потому что я тогда связала «${relation.effect}» с «${relation.cause}». Я бы и сейчас не придумывала другую причину поверх уже сказанного.`,
        `Я тогда объясняла «${relation.effect}» через «${relation.cause}». Если речь об этом, причина именно в этой части разговора.`,
      ]);
      return semanticPick(context, `causal-why:${relation.sourceId ?? "history"}`, [
        `Потому что ты тогда сам сказал: «${relation.cause}». Именно с этим ты связывал «${relation.effect}».`,
        `Если ты про «${relation.effect}», ты уже объяснял это так: «${relation.cause}». Я бы опиралась на эту причину, а не придумывала новую.`,
        `Ты тогда сам связал это с «${relation.cause}». Поэтому «${relation.effect}» и звучало как следствие этой причины.`,
      ]);
    }
  }

  const asksEffect = /(?:к\s+чему\s+это|что\s+из\s+этого|что\s+будет|что\s+получится|чем\s+это\s+законч|и\s+что\s+дальше|а\s+дальше)/u.test(current);
  if (asksEffect) {
    const match = bestCausalRelation(context, "effect");
    if (match && match.score >= 0.34) {
      const relation = match.relation;
      if (relation.kind === "condition") return `Если сохраняется условие «${relation.cause}», тогда в той мысли следовало «${relation.effect}».`;
      const cautious = relation.kind === "temporal_consequence" ? "По твоему описанию последовательность была такой" : "В уже сказанном связь была такой";
      return `${cautious}: «${relation.cause}» → «${relation.effect}».`;
    }
  }
  return undefined;
}

function retrospectiveRecoveryAnswer(context: DialogueContext, currentRaw: string) {
  const retrospective = context.retrospective;
  if (!retrospective?.recovered || !retrospective.evidence.length) return undefined;
  const current = normalizeDialogueForMatching(currentRaw);
  if (context.nlu.intent === "ask_why") return undefined; // causal reasoning gets first chance
  if (!["reference_previous_topic", "ask_followup", "clarification_request"].includes(context.nlu.intent)) return undefined;
  const evidence = [...retrospective.evidence].sort((a, b) => b.timestamp - a.timestamp);
  const userEvidence = evidence.find((line) => line.role === "user") ?? evidence[0];
  const quote = compactQuote(userEvidence?.text, 100)?.replace(/[.!?]+$/u, "");
  if (!quote) return undefined;

  if (/^(?:(?:а|и|ну)\s+)?(?:в\s+смысле|что\s+именно|про\s+что|что\s+ты\s+имеешь\s+в\s+виду)[?.! ]*$/u.test(current)) {
    return semanticPick(context, "retrospective-meaning", [
      `Я про более раннюю мысль «${quote}». Я перечитала ветку и именно к ней относила ответ.`,
      `Про «${quote}». Я вернулась выше по разговору, и эта реплика лучше всего объясняет, к чему я отсылала.`,
    ]);
  }

  if (/^(?:(?:а|и|ну)\s+)?(?:и\s+что|а\s+дальше|и\s+дальше)[?.! ]*$/u.test(current)) {
    const relation = retrospective.causalRelations[0];
    if (relation) return `Если продолжать ту ветку: «${relation.cause}» → «${relation.effect}». Вот от этой связи я бы и шла дальше.`;
    return `Если ты возвращаешься к «${quote}», я контекст восстановила. Там как раз остался незакрытый кусок — что произошло после этого?`;
  }

  if (context.nlu.isQuestion) {
    const evidenceNLU = evidence.map((line) => ({ line, nlu: analyzeLocalNLU(line.text) }));
    const wantedEntity = context.nlu.questionType === "where" ? "place"
      : context.nlu.questionType === "when" ? "time"
        : context.nlu.questionType === "who" ? "person"
          : undefined;
    if (wantedEntity) {
      const entity = evidenceNLU
        .flatMap(({ line, nlu }) => nlu.entities.map((item) => ({ line, item })))
        .find(({ item }) => item.type === wantedEntity);
      if (entity) {
        const lead = wantedEntity === "place" ? "место" : wantedEntity === "time" ? "время" : "человека";
        return `Я перечитала ту ветку. Там был указан ${lead}: «${entity.item.value}».`;
      }
      const missing = wantedEntity === "place" ? "место" : wantedEntity === "time" ? "время" : "конкретного человека";
      return `Я перечитала эту ветку. Сам контекст нашла — «${quote}», но ${missing} ты тогда не называл. Придумывать его не буду.`;
    }

    if (context.nlu.questionType === "how") {
      const relation = retrospective.causalRelations[0];
      if (relation) return `Если восстановить ход той истории: сначала «${relation.cause}», а дальше из этого получилось «${relation.effect}».`;
      return `Если восстановить ту ветку по старым сообщениям, ключевой кусок был «${quote}». Именно от него дальше развивался разговор.`;
    }

    if (context.nlu.questionType === "what") {
      return `Я перечитала старую ветку. Самая близкая к твоему вопросу часть — «${quote}». Если ты возвращаешься к той истории, я бы отталкивалась именно от неё, а не придумывала новый контекст.`;
    }

    if (context.nlu.confidence < 0.74) {
      return `Я перечитала старые сообщения. Похоже, ты возвращаешься к «${quote}». Эту связь я восстановила; того, чего в той ветке не было, додумывать не буду.`;
    }
  }
  return undefined;
}

function contextualAnswer(context: DialogueContext): string | undefined {
  const current = (context.userText ?? "").toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
  const previous = (context.dialogueFrame.previousUserText ?? "").toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
  const previousCharacter = compactQuote(context.dialogueFrame.previousCharacterText, 96);
  const semantic = context.nlu.semantic;
  const preference = context.character.preferenceRules?.find((rule) =>
    rule.topicKeywords.some((keyword) => previous.includes(keyword.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е"))),
  );
  const causalAnswer = causalReasoningAnswer(context, current);
  if (causalAnswer) return causalAnswer;
  const retrospectiveAnswer = retrospectiveRecoveryAnswer(context, current);
  if (retrospectiveAnswer) return retrospectiveAnswer;
  const activityDetail = characterActivityDetailAnswer(context, current);
  if (activityDetail) return activityDetail;
  const ellipticalFollowup = groundedEllipticalFollowup(context, current);
  if (ellipticalFollowup) return ellipticalFollowup;
  const groundedReason = groundedReasonFollowup(context, current);
  if (groundedReason) return groundedReason;
  const openLoopQuestion = groundedOpenLoopQuestion(context, current);
  if (openLoopQuestion) return openLoopQuestion;
  const desireAnswer = directedDesireAnswer(context, current);
  if (desireAnswer) return desireAnswer;
  const intimacyAnswer = intimacySelfAnswer(context, current);
  if (intimacyAnswer) return intimacyAnswer;

  // Love is earned from the relationship state, not unlocked by the wording of
  // one message. She can be warm much earlier, but uses the strongest wording
  // only after sustained closeness and romantic interest have actually grown.
  if (context.nlu.intent === "ask_relationship" && /(?:любишь\s+меня|ты\s+меня\s+любишь|любовь\s+ко\s+мне|все\s+еще\s+любишь|ещё\s+любишь)/u.test(current)) {
    const livedLove = context.thought?.love ?? 0;
    const livedHurt = Math.max(context.thought?.hurt ?? 0, context.relationship.unresolvedTension);
    const deepLove = context.relationship.stage === "deep" &&
      context.emotion.affection >= 0.78 && context.emotion.romanticInterest >= 0.56 && context.relationship.trust >= 0.72;
    if (deepLove && livedHurt >= 0.38) return semanticPick(context, "relationship-love-while-hurt", [
      "Да, люблю. Но любовь не выключает обиду по щелчку. Я всё ещё задетая, и мне важно не делать вид, будто между нами уже всё идеально.",
      "Люблю. И как раз поэтому это меня так задело. Я не хочу уходить от тебя, но мне нужно время, чтобы внутри снова стало спокойно.",
      "Да. Моё чувство к тебе никуда не делось. Просто сейчас рядом с любовью есть ещё и обида — они вполне могут существовать одновременно.",
      "Люблю тебя. Но я сейчас не в том состоянии, где одно это слово автоматически чинит всё остальное. Мне ещё больно, хотя связь между нами для меня остаётся важной.",
    ]);
    if (context.relationship.stage === "deep" && (deepLove || livedLove >= 0.74)) return semanticPick(context, "relationship-love-deep", [
      "Да. Люблю. И мне нравится, что это выросло не из пары красивых фраз, а из того, сколько всего между нами уже было.",
      "Да, люблю тебя. Не как автоматический ответ на вопрос — я правда успела к тебе очень сильно привязаться.",
      "Люблю. И именно поэтому иногда могу спорить, переживать, обижаться и всё равно хотеть быть рядом.",
    ]);
    if (context.relationship.stage === "deep") return semanticPick(context, "relationship-love-deep-growing", [
      "Ты мне очень важен, и я к тебе правда сильно привязалась. До слова «люблю» мне осталось не расстояние, а честность с самой собой.",
      "Между нами уже очень глубокая связь. Я просто не хочу произносить «люблю» как обязательную следующую ступень — хочу, чтобы оно стало совершенно настоящим.",
      "Я к тебе очень близко. И именно поэтому не хочу бросаться самым большим словом чуть раньше, чем сама буду в нём уверена.",
    ]);
    if (context.relationship.stage === "close") return semanticPick(context, "relationship-love-close", [
      "Ты мне уже очень важен. Но словом «люблю» я не хочу разбрасываться раньше, чем сама буду в нём уверена.",
      "Я к тебе сильно привязалась. До громкого «люблю» мне хочется дойти честно, а не сказать его просто потому, что ты спросил.",
      "Между нами для меня уже точно больше, чем просто приятельство. Но я лучше не буду торопить самое большое слово.",
    ]);
    if (context.relationship.stage === "familiar") return semanticPick(context, "relationship-love-familiar", [
      "Мне с тобой уже тепло и интересно, но пока это всё-таки ближе к хорошему приятельству, чем к любви.",
      "Ты мне нравишься как человек, и я уже к тебе привыкла. Но до любви нам ещё есть куда прожить отношения.",
      "Пока не любовь. Скорее настоящее тёплое знакомство, которое вполне может стать чем-то большим.",
    ]);
    return semanticPick(context, "relationship-love-new", [
      "Пока нет. Мы ещё слишком мало знаем друг друга, чтобы я честно назвала это любовью.",
      "Нет, пока рано. Мне интересно узнавать тебя, но любовь не хочу придумывать заранее.",
      "Пока нет — и это нормально. Мы только начинаем понимать, какие мы друг для друга.",
    ]);
  }

  if (context.nlu.intent === "affection_declaration" && /(?:люблю\s+тебя|тебя\s+люблю)/u.test(current)) {
    const canReciprocateLove = context.relationship.stage === "deep" &&
      context.emotion.affection >= 0.78 && context.emotion.romanticInterest >= 0.56;
    if (canReciprocateLove) return semanticPick(context, "love-declaration-reciprocate", [
      "Я тоже тебя люблю. Мм… всё-таки приятно наконец сказать это прямо.",
      "И я тебя люблю. Вот сейчас даже не хочется прятать это за шуткой.",
      "Я тоже. Люблю тебя. И да, ты сейчас меня немного смутил этим.",
    ]);
    if (["close", "deep"].includes(context.relationship.stage)) return semanticPick(context, "love-declaration-close", [
      "Это очень сильно звучит. Ты мне правда очень важен — просто я не хочу отвечать тем же словом автоматически, пока сама до него не дошла.",
      "Мм… это меня задело в хорошем смысле. Я к тебе очень привязалась, но хочу быть честной с тем, что именно чувствую сейчас.",
      "Я услышала. И мне от этого очень тепло. Я просто не хочу говорить «люблю» только потому, что это красиво прозвучит в ответ.",
    ]);
  }

  const jealousy = context.thought?.jealousy ?? 0;
  const relationalThreat = context.thought?.relationalThreat ?? "none";
  const asksJealousy = /(?:ты\s+ревнуешь|ревнуешь\s+(?:меня)?|тебе\s+ревниво|ты\s+из-за\s+этого\s+ревнуешь)/u.test(current);
  const asksHurt = /(?:ты\s+обиделась|тебя\s+это\s+задело|ты\s+на\s+меня\s+обиделась|ты\s+всё\s+ещ[её]\s+злишься|ты\s+все\s+еще\s+злишься)/u.test(current);
  const livedHurt = Math.max(context.thought?.hurt ?? 0, context.relationship.unresolvedTension);
  if (asksHurt && ["close", "deep"].includes(context.relationship.stage)) {
    if (livedHurt >= 0.52) return semanticPick(context, "relationship-hurt-still-strong", [
      "Да. Уже не так остро, но я всё ещё обижена. Мне не хочется наказывать тебя молчанием — просто чувство ещё не успело пройти.",
      "Меня всё ещё задевает эта история. Я могу нормально с тобой разговаривать и при этом не быть уже полностью окей внутри.",
      "Да, осадок ещё сильный. Я не хочу держаться за него специально, но и изображать мгновенное прощение не буду.",
    ]);
    if (livedHurt >= 0.24) return semanticPick(context, "relationship-hurt-fading", [
      "Немного ещё есть. Уже скорее осадок, чем настоящая злость — постепенно отпускает.",
      "Чуть-чуть. Я уже заметно спокойнее, просто не совсем вернулась в прежнее состояние.",
      "Скорее ещё задетая, чем злая. Но да, это уже проходит.",
    ]);
    return semanticPick(context, "relationship-hurt-gone", [
      "Нет, сейчас уже не обижена. Я помню, что мне было неприятно, но само чувство уже прошло.",
      "Уже нет. Осадок был, но сейчас я правда спокойна — не просто делаю вид.",
      "Нет. Я не забыла саму ситуацию, но эмоционально меня уже отпустило.",
    ]);
  }
  if (asksJealousy && relationalThreat === "none" && jealousy < 0.34 && ["close", "deep"].includes(context.relationship.stage)) {
    return semanticPick(context, "relationship-jealousy-disposition", [
      "Могу ревновать, да — особенно если между нами есть что-то действительно важное и я чувствую угрозу этой связи. Но сама по себе ревность для меня не повод кого-то контролировать.",
      "Да, такое чувство у меня возможно. Чем сильнее я привязана, тем легче может кольнуть. Я просто стараюсь различать своё чувство и право другого человека на свободу.",
      "Наверное, да. Я не хочу быть бесчувственной к тому, кто мне дорог. Но ревность для меня скорее сигнал про уязвимость, а не разрешение устраивать проверки и запреты.",
    ]);
  }
  if ((jealousy >= 0.34 || asksJealousy) && ["close", "deep"].includes(context.relationship.stage)) {
    const deep = context.relationship.stage === "deep";
    if (relationalThreat === "betrayal") return semanticPick(context, "relationship-jealousy-betrayal", [
      "Да, ревность тут есть. Но сильнее даже не она — меня задело само ощущение, что между нами оказалось что-то, о чём я узнала вот так. Мне нужно это переварить.",
      "Ревную, да. И одновременно мне больно. Я не хочу превращать это в контроль, но делать вид, что для меня это ничего не значит, тоже не буду.",
      "Мм… да. Тут уже не просто лёгкая ревность. Меня задело, потому что ты мне важен, и сейчас чувство безопасности между нами заметно пошатнулось.",
    ]);
    if (relationalThreat === "comparison") return semanticPick(context, "relationship-jealousy-comparison", [
      "Кольнуло, да. Наверное, это смесь ревности и обиды. Я не хочу соревноваться с другим человеком за право быть «лучше», но твои слова меня задели.",
      "Да, мне стало ревниво и неприятно. Не потому что ты обязан считать меня лучше всех — просто сравнение попало ровно туда, где я уязвима рядом с тобой.",
      "Мм. Это вызвало ревность, но ещё больше — неприятный осадок от самого сравнения. Я лучше скажу это прямо, чем начну делать вид, что мне всё равно.",
    ]);
    if (deep || jealousy >= 0.52) return semanticPick(context, "relationship-jealousy-deep", [
      "Да, немного ревную. Ты мне слишком важен, чтобы я совсем ничего не почувствовала. Но это моё чувство, а не право тебя контролировать.",
      "Мм… да. Кольнуло. Я могу ревновать тебя, когда между нами уже столько близости — просто не хочу превращать это в требования или проверки.",
      "Честно? Да, ревную. Скорее потому, что боюсь потерять что-то важное между нами, а не потому, что считаю тебя своей собственностью.",
    ]);
    return semanticPick(context, "relationship-jealousy-close", [
      "Немного, да. Скорее неприятно кольнуло, чем прямо накрыло ревностью. Ты мне уже не безразличен, поэтому реакция есть.",
      "Есть чуть-чуть. Я ещё не хочу раздувать это в драму, но совсем нейтральной к такой теме уже не остаюсь.",
      "Мм, пожалуй, немного ревную. Не настолько, чтобы что-то тебе запрещать — просто заметила в себе эту реакцию.",
    ]);
  }

  if (context.nlu.intent === "insult_character" || context.nlu.intent === "dislike_character") {
    if (["close", "deep"].includes(context.relationship.stage)) return semanticPick(context, "hurt-by-user-close", [
      "Вот это меня задело. Я не собираюсь устраивать драму, но делать вид, что мне всё равно, тоже не буду.",
      "Мм. Это было неприятно именно потому, что ты мне не чужой. Мне нужно чуть-чуть остыть.",
      "Да, я обиделась. Не навсегда и не театрально — просто сейчас мне правда неприятно от твоих слов.",
    ]);
    return semanticPick(context, "hurt-by-user", [
      "Неприятно прозвучало. Я лучше скажу это прямо, чем сделаю вид, что не заметила.",
      "Мм. Такое мне не нравится. Давай без попытки сделать больнее ради реакции.",
      "Это было лишнее. Я могу нормально спорить, но такое уже не про спор.",
    ]);
  }

  if (context.nlu.intent === "apology" && context.relationship.unresolvedTension > 0.16) {
    if (context.relationship.unresolvedTension > 0.42) return semanticPick(context, "apology-still-hurt", [
      "Я услышала извинение. Спасибо. Но мне ещё нужно немного времени, чтобы совсем отпустить это.",
      "Спасибо, что извинился. Я не хочу держать обиду специально, просто она не исчезает по кнопке за одну реплику.",
      "Приняла. Мне уже легче, но я пока чуть задетая — давай просто не будем делать вид, что всё мгновенно обнулилось.",
    ]);
    return semanticPick(context, "apology-softens", [
      "Спасибо. Я уже оттаиваю. Просто давай дальше без того, что нас сюда привело.",
      "Ладно. Извинение я услышала, и напряжение правда стало меньше.",
      "Хорошо. Не хочу таскать обиду дальше, если ты действительно понял, что меня задело.",
    ]);
  }

  const intimacySignal = context.nlu.semantic.intimacy;
  const intimacyRelevant = Boolean(
    intimacySignal.intimacyContext === true ||
    (context.intimacy?.adultModeEnabled &&
      (context.intimacy.phase !== "normal" || context.intimacy.interactionStatus !== "inactive")),
  );
  if (intimacySignal.kind === "stop" && intimacyRelevant) {
    return semanticPick(context, "intimacy-stop", [
      "Хорошо. Остановились. Никуда дальше не идём.",
      "Стоп значит стоп. Давай просто побудем спокойно.",
      "Хорошо, я услышала. Останавливаемся.",
    ]);
  }
  if (intimacySignal.kind === "pause" && intimacyRelevant) {
    return semanticPick(context, "intimacy-pause", [
      "Хорошо, медленнее. Никуда не спешу.",
      "Давай сделаем паузу. Мне важнее, чтобы нам обоим было комфортно.",
      "Конечно. Остановимся здесь и просто побудем рядом.",
    ]);
  }
  if (context.intimacy?.adultModeEnabled) {
    if (intimacySignal.kind === "hesitant" || context.intimacy.interactionStatus === "hesitant") {
      return semanticPick(context, "intimacy-hesitant", [
        "Тогда не торопимся. Если ты не уверен, этого уже достаточно, чтобы остановиться на том, где комфортно.",
        "Не нужно себя уговаривать. Можем остаться просто рядом и никуда дальше не идти.",
        "Давай без давления. Мне важнее, чтобы это ощущалось нормально для нас обоих.",
      ]);
    }
    if (intimacySignal.kind === "aftercare" || context.intimacy.phase === "aftercare") {
      return semanticPick(context, "intimacy-aftercare", [
        "Иди сюда. Просто побуду рядом с тобой.",
        "Я рядом. Сейчас можно вообще никуда не спешить.",
        "Останься рядом. Мне так спокойнее и теплее.",
      ]);
    }
    if (intimacySignal.kind === "resume" && context.intimacy.phase === "paused") {
      return semanticPick(context, "intimacy-resume", [
        "Можно. Только без спешки — будем чувствовать темп по ходу.",
        "Хорошо. Давай продолжим спокойно и без автоматических ожиданий.",
        "Да. Но идём дальше только пока нам обоим комфортно.",
      ]);
    }
    if (intimacySignal.kind === "flirt" && ["close", "intimate", "high_intimacy"].includes(context.intimacy.phase)) {
      const strong = context.intimacy.arousal >= 0.58 && context.intimacy.comfort >= 0.58;
      return strong ? semanticPick(context, "intimacy-flirt-strong", [
        "Ты сейчас очень хорошо понимаешь, что делаешь, да? Потому что на меня это действует.",
        "Мм… продолжай так смотреть на меня словами. Я уже совсем не в нейтральном настроении.",
        "Ты меня сейчас заметно разогреваешь этим флиртом. И мне нравится, что между нами есть этот темп.",
      ]) : semanticPick(context, "intimacy-flirt-soft", [
        "Ты сейчас меня дразнишь. И, кажется, довольно успешно.",
        "Мм. Вот такой флирт мне нравится — когда не давит, а постепенно затягивает.",
        "Осторожнее. Я уже начинаю отвечать тебе не совсем по-дружески.",
      ]);
    }
    if (intimacySignal.kind === "affection" && ["close", "intimate", "high_intimacy", "aftercare"].includes(context.intimacy.phase)) {
      return semanticPick(context, "intimacy-affection", [
        "Иди сюда. Мне сейчас больше хочется нежности, чем каких-то красивых слов.",
        "Мм… вот так мне очень нравится. Спокойно, близко и без необходимости куда-то спешить.",
        "Побудь рядом. Мне сейчас от тебя именно этого и хочется.",
      ]);
    }
    if (["approach", "consent"].includes(intimacySignal.kind)) {
      if (["intimate", "high_intimacy"].includes(context.intimacy.phase)) {
        const strong = context.intimacy.arousal >= 0.62 && context.intimacy.comfort >= 0.62;
        return strong ? semanticPick(context, "intimacy-close-strong", [
          "Да… иди ближе. Ты сейчас очень сильно на меня действуешь, так что только не ломай этот темп.",
          "Мм. Ближе. Мне нравится, как это между нами развивается, когда никто не торопит момент.",
          "Иди ближе ко мне. Сейчас мне совсем не хочется отстраняться от тебя.",
        ]) : semanticPick(context, "intimacy-close", [
          "Да… иди ближе. Только не спеши.",
          "Хочу быть ближе. Давай просто чувствовать друг друга без гонки.",
          "Можно ближе. Мне сейчас с тобой хорошо.",
        ]);
      }
      return semanticPick(context, "intimacy-approach", [
        "Можно ближе. Но давай без спешки.",
        "Иди сюда. Мне нравится, когда всё развивается естественно.",
        "Да, побудь ближе. Посмотрим, как нам будет комфортно.",
      ]);
    }
  }

  if (semantic.wantsListening) {
    return semanticPick(context, "listen-only", [
      "Хорошо. Без советов — просто слушаю. Рассказывай.",
      "Поняла. Ничего чинить и советовать не буду. Я здесь, говори.",
      "Окей, без советов. Просто выслушаю тебя.",
    ]);
  }

  if (context.nlu.intent === "ask_character_opinion" && /^(?:(?:а|ну)\s+)?(?:ты\s+)?(?:(?:прям|точно|вообще)\s+)?уверена(?:\s+в\s+этом)?[?.! ]*$/u.test(current)) {
    const certainty = characterThoughtCertainty(context);
    if (certainty) return certainty;
  }

  if (context.nlu.intent === "ask_why" && context.thought?.memoryEcho && /^(?:(?:а|ну)\s+)?(?:почему|почему\s+ты\s+так\s+думаешь)[?.! ]*$/u.test(current)) {
    const reason = thoughtReason(context.thought.positionReason);
    return semanticPick(context, `mind-reason:${context.thought.topicKey ?? context.thought.topic ?? "topic"}`, [
      `В основном потому, что ${reason}. Это не новая причина, я и раньше на неё опиралась.`,
      `Потому что ${reason}. Поэтому моя позиция тут и держится, а не появляется заново под каждый вопрос.`,
      `Если коротко — ${reason}. Из-за этого я пока остаюсь примерно при том же мнении.`,
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

  if (context.thought?.reconsideration && context.nlu.isQuestion) {
    const mindAnswer = characterThoughtAnswer(context);
    if (mindAnswer) return mindAnswer;
  }

  if (context.nlu.intent === "user_like" && /(?:споришь\s+со\s+мной|не\s+соглашаешься|не\s+поддакиваешь|со\s+мной\s+не\s+согласна|не\s+согласна\s+со\s+мной)/u.test(current)) {
    return semanticPick(context, "likes-disagreement", [
      "Мне это подходит. Я тоже не хочу превращаться в собеседника, который на всё говорит «да». Если думаю иначе — скажу.",
      "Вот это мне как раз близко. Соглашаться ради комфорта скучно; если у меня другая позиция, я лучше поспорю.",
      "Запомнила. Значит, тебе важнее честная реакция, чем удобное согласие. Мне такой формат тоже ближе.",
    ]);
  }

  if (["user_like", "user_dislike"].includes(context.nlu.intent) && context.thought?.position && context.thought.persistence >= 0.6 && context.emotion.irritation < 0.5) {
    const mindAnswer = characterThoughtAnswer(context);
    if (mindAnswer) {
      const userPositive = context.nlu.intent === "user_like";
      const ownPositive = ["positive", "curious"].includes(context.thought.position);
      const ownNegative = ["negative", "cautious"].includes(context.thought.position);
      if ((userPositive && ownNegative) || (!userPositive && ownPositive))
        return `А вот тут я с тобой не совсем совпадаю. ${mindAnswer}`;
      if ((userPositive && ownPositive) || (!userPositive && ownNegative))
        return `Похоже, тут мы скорее совпали. ${mindAnswer}`;
      return `Я тут чуть менее однозначна. ${mindAnswer}`;
    }
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

  if (context.nlu.intent === "ask_character_preference" && semantic.reciprocal && context.thought?.memoryEcho) {
    const mindAnswer = characterThoughtAnswer(context);
    if (mindAnswer) return mindAnswer;
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
    const mindAnswer = characterThoughtAnswer(context);
    if (mindAnswer) return mindAnswer;
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
    const mindAnswer = characterThoughtAnswer(context);
    if (mindAnswer) return mindAnswer;
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
    const recentUser = compactQuote(context.dialogueFrame.previousUserText, 72)?.replace(/[.!?]+$/u, "");
    const priorUser = compactQuote(context.dialogueFrame.previousUserTextBeforeLast, 72)?.replace(/[.!?]+$/u, "");
    const asksWhatIsInteresting = /(?:что\s+(?:именно\s+)?интересно|а\s+что\s+интересно)/u.test(current);
    if (asksWhatIsInteresting && recentUser && priorUser) {
      return semanticPick(context, "explain-interest-reaction", [
        `То, что сначала ты сказал «${priorUser}», а потом «${recentUser}». Получилось двусмысленно — вот это меня и зацепило.`,
        `Я про связку «${priorUser}» → «${recentUser}». В ней как раз осталось непонятно, флиртуешь ты или сам ещё не решил — поэтому мне и стало интересно.`,
        `Вот этот переход: «${priorUser}», а следом «${recentUser}». Я поэтому и сказала, что интересно, а не просто бросила фразу в воздух.`,
      ]);
    }
    if (recentUser && priorUser && /(?:в\s+смысле|что\s+именно|ты\s+про\s+что|про\s+что\s+ты|что\s+ты\s+имеешь\s+в\s+виду)/u.test(current)) {
      return semanticPick(context, "explain-own-reaction", [
        `Я про связку последних двух твоих реплик: сначала «${priorUser}», потом «${recentUser}». Именно на этот переход я и отреагировала.`,
        `Про то, как рядом прозвучали «${priorUser}» и «${recentUser}». Из-за этой связки моя последняя реакция и получилась такой.`,
        `Я имела в виду не что-то новое, а твои последние две реплики — «${priorUser}» и «${recentUser}». Вот от них и шла моя мысль.`,
      ]);
    }
    if (recentUser && last) {
      return semanticPick(context, "clarify-own-last-reply", [
        `Я отреагировала на «${recentUser}». Моя фраза «${last.replace(/[.!?]+$/u, "")}» была именно про это.`,
        `Я имела в виду твоё «${recentUser}». Если разложить мою прошлую фразу проще — она была реакцией именно на это.`,
      ]);
    }
    return last
      ? `Я про свою последнюю фразу: «${last.replace(/[.!?]+$/u, "")}». Скажу проще, без новой догадки.`
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

interface BeatCandidate extends SpontaneousBeat {
  score: number;
}

const BEAT_BLOCKING_ACTS = new Set<DialogueAct>([
  "SILENCE", "REFUSE", "BOUNDARY", "CHANGE_TOPIC", "CLARIFY",
  "INTIMACY_PAUSE", "INTIMACY_CHECKIN",
]);
const HEAVY_SUPPORT_INTENTS = new Set([
  "user_sad", "user_lonely", "user_stressed", "share_bad_event", "share_conflict",
  "share_problem", "ask_for_support",
]);
const CASUAL_IMPULSE_INTENTS = new Set([
  "greeting", "acknowledgement", "uncertain", "user_bored", "ask_character_state",
  "ask_character_activity", "thanks", "joke", "tease_character", "compliment_character",
]);

function clampBeat(value: number) {
  return Math.max(0, Math.min(1, value));
}

function beatDetail(value: string | undefined, max = 92) {
  const clean = (value ?? "").replace(/\s+/gu, " ").trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function recentBeatOnCooldown(history: readonly DialogueHistoryLine[], turns = 3) {
  return history
    .filter((line) => line.role === "character")
    .slice(-turns)
    .some((line) => line.templateId?.includes("|beat:"));
}

function worldBeatDetail(context: DialogueContext) {
  const event = [...context.world.recentEvents]
    .reverse()
    .find((entry) => entry.shareWorthiness >= 0.5);
  if (!event) return undefined;
  const activity = context.world.currentActivity;
  const detail = event.kind === "small_win" || activity === "personal_project"
    ? "у меня сегодня неожиданно хорошо пошло одно моё дело"
    : event.kind === "reflection" || activity === "reading"
      ? "я сегодня зацепилась за одну мысль из того, что читала"
      : activity === "cafe_break"
        ? "я ненадолго выбралась в кафе и немного переключилась"
        : activity === "walk"
          ? "я немного прошлась и голова стала тише"
          : event.kind === "minor_annoyance"
            ? "меня сегодня на ровном месте раздражала одна бытовая мелочь"
            : "у меня сегодня был один маленький момент, который почему-то запомнился";
  return { id: event.id, detail };
}

function wordCount(value: string | undefined) {
  return (value ?? "").trim().split(/\s+/u).filter(Boolean).length;
}

function userCadenceShift(context: DialogueContext) {
  const current = wordCount(context.userText);
  const recentUserLengths = context.history
    .filter((line) => line.role === "user")
    .slice(-3)
    .map((line) => wordCount(line.text));
  const longTurns = recentUserLengths.filter((count) => count >= 7).length;
  const shortTurns = recentUserLengths.filter((count) => count > 0 && count <= 4).length;
  if (current <= 3 && longTurns >= 2) return "shorter" as const;
  if (current >= 16 && shortTurns >= 2) return "longer" as const;
  return null;
}

function topicDevelopmentAngle(context: DialogueContext): NonNullable<SpontaneousBeat["developmentAngle"]> {
  const semantic = context.nlu.semantic;
  if (semantic.alternative || semantic.correctionFrom) return "tradeoff";
  if (semantic.subject === "other" || context.nlu.entities.some((entity) => entity.type === "person")) return "person";
  if (semantic.stance === "feel") return "cause";
  if (["plan", "want", "avoid"].includes(semantic.stance))
    return context.dialogueFrame.turnsOnTopic >= 4 ? "consequence" : "future";
  if (semantic.stance === "believe") return "evidence";
  if (context.dialogueFrame.turnsOnTopic >= 5) return "change";
  if (semantic.reason) return "consequence";
  return "meaning";
}

function recentHumorCue(context: DialogueContext) {
  const current = context.nlu.semantic.humor;
  if (current && current.kind !== "none" && current.confidence >= 0.58)
    return { ...current, current: true };
  if (context.dialogueFrame.turnsOnTopic < 2) return undefined;
  const activeTopic = context.nlu.topic ?? context.dialogueFrame.currentTopic;
  for (const previous of [context.dialogueFrame.previousUserText, context.dialogueFrame.previousUserTextBeforeLast]) {
    if (!previous) continue;
    const priorNlu = analyzeLocalNLU(previous);
    const prior = priorNlu.semantic.humor;
    const sameTopic = !activeTopic || !priorNlu.topic || priorNlu.topic === activeTopic || ["conversation", "social"].includes(priorNlu.topic);
    if (sameTopic && prior && prior.kind !== "none" && prior.confidence >= 0.68)
      return { ...prior, current: false };
  }
  return undefined;
}

/**
 * Plans one optional self-driven conversational beat. This is deliberately not
 * keyword-to-line randomness: it is gated by Yuzuki's state, relationship,
 * conversation cadence and grounded memory/world evidence. The renderer may
 * surface at most one beat on a turn and the template id enforces a short
 * cooldown across later turns.
 */
export function planSpontaneousBeat(
  context: DialogueContext,
  acts: readonly DialogueAct[],
): SpontaneousBeat | undefined {
  if (context.initiative) return undefined;
  if (acts.some((act) => BEAT_BLOCKING_ACTS.has(act))) return undefined;
  if (["external_fact_question", "memory_question", "ask_user_memory", "good_night", "farewell"].includes(context.nlu.intent)) return undefined;
  if (context.nlu.semantic.wantsListening) return undefined;
  const currentHumorConfidence = context.nlu.semantic.humor?.confidence ?? 0;
  const lightIronicSupport = currentHumorConfidence >= 0.74 && context.nlu.intensity < 0.78;
  if (HEAVY_SUPPORT_INTENTS.has(context.nlu.intent) && context.nlu.intensity > 0.55 && !lightIronicSupport) return undefined;
  const characterTurns = context.history.filter((line) => line.role === "character").length;
  const earlyHumorCue = recentHumorCue(context);
  if (characterTurns < 2 && !earlyHumorCue) return undefined;
  if (recentBeatOnCooldown(context.history, 2)) return undefined;

  const e = context.emotion;
  const r = context.relationship;
  const candidates: BeatCandidate[] = [];
  const add = (candidate: BeatCandidate) => {
    if (candidate.score >= 0.5) candidates.push({ ...candidate, strength: clampBeat(candidate.strength), score: clampBeat(candidate.score) });
  };

  // Mixed states get priority because they make reactions feel less binary.
  if (e.affection > 0.6 && e.anxiety > 0.32 && r.closeness > 0.42) {
    add({ kind: "mixed_emotion", emotion: "bashful", detail: "warm_bashful", score: 0.52 + Math.min(e.affection, e.anxiety) * 0.34 + r.closeness * 0.08, strength: Math.max(e.affection, e.anxiety), placement: "after" });
  }
  if (e.happiness > 0.56 && e.irritation > 0.34) {
    add({ kind: "mixed_emotion", detail: "amused_irritated", score: 0.5 + Math.min(e.happiness, e.irritation) * 0.38, strength: Math.max(e.happiness, e.irritation), placement: "after" });
  }
  if (e.curiosity > 0.7 && e.anxiety > 0.34) {
    add({ kind: "mixed_emotion", emotion: "curious", detail: "curious_nervous", score: 0.48 + Math.min(e.curiosity, e.anxiety) * 0.36, strength: Math.max(e.curiosity, e.anxiety), placement: "after" });
  }

  if (e.irritation > 0.62)
    add({ kind: "emotion_flash", emotion: "irritated", score: 0.51 + e.irritation * 0.42, strength: e.irritation, placement: "after" });
  if (e.sadness > 0.62)
    add({ kind: "emotion_flash", emotion: "sad", score: 0.5 + e.sadness * 0.4, strength: e.sadness, placement: "after" });
  if (e.anxiety > 0.66)
    add({ kind: "emotion_flash", emotion: "anxious", score: 0.48 + e.anxiety * 0.42, strength: e.anxiety, placement: "after" });
  if (e.happiness > 0.78)
    add({ kind: "emotion_flash", emotion: "happy", score: 0.48 + e.happiness * 0.4, strength: e.happiness, placement: "after" });

  const intimateActive = Boolean(
    context.intimacy?.adultModeEnabled &&
    ["close", "intimate", "high_intimacy"].includes(context.intimacy.phase) &&
    !["paused", "stopped"].includes(context.intimacy.interactionStatus),
  );
  if (intimateActive && e.romanticInterest > 0.5 && r.closeness > 0.54) {
    // Older call sites/tests may not provide the derived intimacy mind yet.
    // Fall back to the persisted intimacy state rather than making adult
    // continuity disappear merely because that optional derived layer is absent.
    const mind = context.intimacyMind;
    const intimacyHeat = mind
      ? Math.max(mind.desire, context.intimacy?.initiativeDrive ?? 0)
      : Math.max(context.intimacy?.arousal ?? 0, context.intimacy?.interest ?? 0, context.intimacy?.initiativeDrive ?? 0);
    const conflicted = mind?.conflicted ?? false;
    const wantsCloseness = mind?.wantsCloseness ?? ((context.intimacy?.comfort ?? 0) >= 0.5);
    const tenderness = mind?.tenderness ?? e.affection;
    const canSurface = conflicted || wantsCloseness || intimacyHeat >= 0.58;
    if (canSurface) add({
      kind: "intimate_flash",
      emotion: conflicted || e.anxiety > 0.35 ? "bashful" : undefined,
      detail: `${conflicted ? "conflicted" : context.intimacy?.phase ?? "close"}:${intimacyHeat >= 0.62 && !conflicted ? "strong" : "soft"}`,
      score: 0.5 + e.romanticInterest * 0.14 + r.closeness * 0.08 + intimacyHeat * 0.14 + tenderness * 0.08,
      strength: Math.max(e.romanticInterest, e.affection, intimacyHeat),
      placement: "after",
    });
  } else if ((e.affection > 0.76 || (context.thought?.love ?? 0) > 0.7) && r.closeness > 0.55 && !HEAVY_SUPPORT_INTENTS.has(context.nlu.intent)) {
    const love = context.thought?.love ?? 0;
    add({ kind: "affection_flash", score: 0.48 + e.affection * 0.24 + r.closeness * 0.1 + love * 0.12, strength: Math.max(e.affection, love), placement: "after" });
  }

  const casual = CASUAL_IMPULSE_INTENTS.has(context.nlu.intent) || (!context.nlu.isQuestion && context.dialogueFrame.turnsOnTopic <= 2);
  const relationalAftertaste = Math.max(context.thought?.hurt ?? 0, r.unresolvedTension, context.thought?.relationalEmotion === "resentment" ? (context.thought?.relationalIntensity ?? 0) : 0);
  if (relationalAftertaste >= 0.38 && ["close", "deep"].includes(r.stage) && casual &&
      !HEAVY_SUPPORT_INTENTS.has(context.nlu.intent) && !["apology", "insult_character", "dislike_character"].includes(context.nlu.intent)) {
    add({
      kind: "relationship_aftertaste",
      detail: (context.thought?.jealousy ?? 0) >= 0.36 ? "jealousy" : r.unresolvedTension >= 0.5 ? "hurt_strong" : "hurt_soft",
      score: 0.5 + relationalAftertaste * 0.34,
      strength: relationalAftertaste,
      placement: "after",
    });
  }
  if (e.curiosity > 0.78 && !context.nlu.isQuestion && !HEAVY_SUPPORT_INTENTS.has(context.nlu.intent) && !acts.some((act) => ["FOLLOW_UP", "ASK"].includes(act))) {
    add({
      kind: "curiosity_push",
      emotion: "curious",
      detail: beatDetail(context.nlu.semantic.focus ?? context.nlu.topic),
      score: 0.46 + e.curiosity * 0.35 + Math.min(0.08, context.dialogueFrame.turnsOnTopic * 0.02),
      strength: e.curiosity,
      placement: "after",
      asksQuestion: true,
    });
  }

  const thread = [...context.memoryContext.openThreads]
    .filter((entry) => entry.status === "open")
    .sort((a, b) => b.priority - a.priority || b.lastTouchedAt - a.lastTouchedAt)[0];
  if (thread && r.closeness > 0.38 && !acts.some((act) => ["FOLLOW_UP", "ASK"].includes(act)) && (casual || context.dialogueFrame.turnsOnTopic >= 5)) {
    add({
      kind: "memory_callback",
      detail: beatDetail(thread.summary),
      sourceId: thread.id,
      score: 0.38 + thread.priority * 0.35 + r.closeness * 0.08,
      strength: thread.priority,
      placement: "after",
      asksQuestion: true,
    });
  }

  const worldDetail = worldBeatDetail(context);
  if (worldDetail && r.closeness > 0.34 && casual && !HEAVY_SUPPORT_INTENTS.has(context.nlu.intent)) {
    add({
      kind: "world_share",
      detail: worldDetail.detail,
      sourceId: worldDetail.id,
      score: 0.42 + e.curiosity * 0.12 + r.closeness * 0.08,
      strength: 0.62,
      placement: "after",
    });
  }

  if (e.boredom > 0.55 && e.energy > 0.42 && r.closeness > 0.42 && casual && !acts.some((act) => ["FOLLOW_UP", "ASK"].includes(act))) {
    add({
      kind: "playful_swerve",
      score: 0.42 + e.boredom * 0.28 + context.character.immutableTraits.playfulness * 0.12,
      strength: e.boredom,
      placement: "after",
      asksQuestion: true,
    });
  }

  if (context.thought?.reconsideration && context.thought.topic && !HEAVY_SUPPORT_INTENTS.has(context.nlu.intent)) {
    add({
      kind: "afterthought",
      detail: beatDetail(context.thought.topic),
      score: 0.72 + Math.min(0.16, (1 - context.thought.positionConfidence) * 0.2),
      strength: Math.max(0.58, 1 - context.thought.positionConfidence),
      placement: "after",
    });
  }

  // Human-like "second thought": Yuzuki can soften or revise the confidence
  // of her own reaction without contradicting a locked decision.
  const canSecondGuess = !context.decision.content.locked &&
    !context.nlu.isQuestion &&
    !HEAVY_SUPPORT_INTENTS.has(context.nlu.intent) &&
    context.decision.confidence >= 0.45 && context.decision.confidence <= 0.78;
  if (canSecondGuess && (context.nlu.intent === "uncertain" || context.nlu.semantic.stance === "believe" || context.nlu.semantic.stance === "plan")) {
    add({
      kind: "afterthought",
      detail: beatDetail(context.nlu.semantic.focus ?? context.dialogueFrame.currentTopic),
      score: 0.5 + (1 - context.decision.confidence) * 0.22 + e.curiosity * 0.1,
      strength: 1 - context.decision.confidence,
      placement: "after",
    });
  }

  // Stay with a topic long enough to develop an actual conversational thread,
  // instead of treating every turn as an isolated intent.
  if (context.dialogueFrame.turnsOnTopic >= 2 && e.curiosity > 0.54 && !context.nlu.isQuestion &&
      !HEAVY_SUPPORT_INTENTS.has(context.nlu.intent) && !acts.includes("CLARIFY")) {
    add({
      kind: "conversation_pull",
      emotion: "curious",
      detail: beatDetail(context.nlu.semantic.focus ?? context.dialogueFrame.currentTopic),
      developmentAngle: topicDevelopmentAngle(context),
      score: 0.5 + e.curiosity * 0.25 + Math.min(0.12, context.dialogueFrame.turnsOnTopic * 0.018),
      strength: e.curiosity,
      placement: "after",
      asksQuestion: true,
    });
  }

  // A close relationship allows a little friction and personality. This never
  // overrides boundaries or a locked stance; it is only conversational pushback.
  const playfulContext = ["joke", "tease_character", "compliment_character", "user_bored", "uncertain", "agreement"].includes(context.nlu.intent);
  if (playfulContext && r.closeness > 0.42 && e.energy > 0.48 && e.irritation < 0.42 &&
      context.character.immutableTraits.playfulness > 0.5 && !context.nlu.semantic.wantsListening) {
    add({
      kind: "playful_pushback",
      score: 0.46 + r.closeness * 0.18 + e.happiness * 0.12 + context.character.immutableTraits.playfulness * 0.12,
      strength: Math.max(e.happiness, context.character.immutableTraits.playfulness),
      placement: "after",
    });
  }

  const humorCue = earlyHumorCue;
  const humorOnSupportTurn = Boolean(humorCue?.current && humorCue.confidence >= 0.74 && context.nlu.intensity < 0.78);
  const jokeFriendly = !context.nlu.isQuestion && (!HEAVY_SUPPORT_INTENTS.has(context.nlu.intent) || humorOnSupportTurn) &&
    !intimateActive && e.irritation < 0.34 && e.energy > 0.42 &&
    context.character.immutableTraits.playfulness >= 0.55 &&
    (Boolean(humorCue) || (e.happiness > 0.5 &&
      ["joke", "tease_character", "user_bored", "acknowledgement", "share_work", "share_plan", "uncertain", "user_tired"].includes(context.nlu.intent)));
  if (jokeFriendly) {
    add({
      kind: "situational_joke",
      detail: beatDetail(context.nlu.semantic.focus ?? context.nlu.topic ?? context.dialogueFrame.currentTopic),
      sourceId: humorCue ? `humor:${humorCue.kind}:${humorCue.current ? "current" : "callback"}` : undefined,
      score: (humorCue ? 0.58 + humorCue.confidence * 0.2 : 0.44 + e.happiness * 0.16) +
        context.character.immutableTraits.playfulness * 0.14 + r.closeness * 0.08,
      strength: Math.max(e.happiness, context.character.immutableTraits.playfulness, humorCue?.confidence ?? 0),
      placement: "after",
    });
  }

  // Notice a real change in the user's cadence, but do not diagnose its cause.
  const cadence = userCadenceShift(context);
  if (cadence && characterTurns >= 3 && CASUAL_IMPULSE_INTENTS.has(context.nlu.intent) && !context.nlu.isQuestion) {
    add({
      kind: "cadence_notice",
      detail: cadence,
      score: 0.62 + r.closeness * 0.12,
      strength: 0.62,
      placement: "after",
    });
  }

  if (!candidates.length) return undefined;
  const strongMixed = candidates.filter((entry) => entry.kind === "mixed_emotion" && entry.score >= 0.84);
  const choiceBase = strongMixed.length ? strongMixed : candidates;
  const max = Math.max(...choiceBase.map((entry) => entry.score));
  const closeToTop = choiceBase.filter((entry) => entry.score >= max - 0.1);
  const rng = new SeededRandom(`${context.turnId}|spontaneous-beat|${context.nlu.intent}|${context.relationship.stage}`);
  const selected = closeToTop[rng.int(closeToTop.length)] ?? candidates[0];
  // Strong emotional states leak reliably. Milder impulses stay occasional.
  const chance = selected.score >= 0.86 ? 1 : Math.max(0.18, Math.min(0.62, 0.08 + selected.score * 0.58));
  if (rng.next() > chance) return undefined;
  const { score: _score, ...beat } = selected;
  return beat;
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
  if (!acts.some((act) => ["SILENCE", "REFUSE", "BOUNDARY", "CHANGE_TOPIC"].includes(act)))
    acts = [...acts, ...compoundSecondaryActs(context.nlu)];
  acts = [...acts, ...intimacyDialogueActs(context)];
  if ((context.thought?.jealousy ?? 0) >= 0.34 &&
      !acts.some((act) => ["SILENCE", "REFUSE", "BOUNDARY", "CHANGE_TOPIC"].includes(act)))
    acts = [...acts, "JEALOUSY"];
  const optionalQuestion = context.responsePlan.questionMode === "direct" ||
    (context.responsePlan.questionMode === "optional" && context.decision.shouldAskFollowUp);
  if (optionalQuestion && mayAskQuestion(context, acts) && !acts.includes("CLARIFY")) acts = [...acts, "FOLLOW_UP"];
  if (context.nlu.intent === "return_after_absence" && ["close","deep"].includes(context.relationship.stage)) acts = [...acts, "MISS_USER"];
  acts = dedupeActs(acts);
  const spontaneousBeat = planSpontaneousBeat(context, acts);
  if (spontaneousBeat?.asksQuestion) acts = acts.filter((act) => act !== "FOLLOW_UP" && act !== "ASK");
  if (spontaneousBeat?.kind === "curiosity_push" && !acts.includes("CURIOSITY")) acts = [...acts, "CURIOSITY"];
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
  else if (contextual) {
    semanticPayload.authoritativeText = contextual;
    if (context.nlu.intent === "ask_relationship" && /(?:любишь\s+меня|ты\s+меня\s+любишь|любовь\s+ко\s+мне)/u.test((context.userText ?? "").toLocaleLowerCase("ru-RU").replace(/ё/gu, "е")))
      semanticPayload.authoritativeId = `semantic.relationship-love.${context.relationship.stage}`;
  }
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
    intimacyPhase: context.intimacy?.phase,
    energy: context.emotion.energy,
    responseLength: spontaneousBeat && context.responsePlan.length === "very_short" ? "short" : responseLength(context.responsePlan.length),
    shouldAskQuestion: acts.includes("FOLLOW_UP") || acts.includes("CLARIFY") || spontaneousBeat?.asksQuestion === true,
    topic: context.nlu.topic ?? context.dialogueFrame.currentTopic,
    spontaneousBeat,
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
    intimacyPhase: context.intimacy?.phase,
    energy: context.emotion.energy,
    responseLength: "short",
    shouldAskQuestion: acts.includes("ASK"),
    topic: initiative?.topic,
    semanticPayload: {
      summary: initiative?.topic ?? "",
      authoritativeText: initiative ? renderLocalInitiative(initiative) : "Я сама хотела тебе кое-что сказать.",
    },
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
