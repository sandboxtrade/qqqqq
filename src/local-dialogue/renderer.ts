/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { KnowledgeFact } from "../memory/model";
import { describeWorldActivityDetail } from "../world/world";
import { maximumRecentSimilarity, recentCharacterResponses, SeededRandom, templateOnCooldown } from "./core";
import { russianLanguagePack } from "./language-pack";
import { normalizeDialogueText } from "./nlu";
import { fallbackKey } from "./planner";
import type { CharacterResponsePlan, DialogueAct, DialogueContext, DialogueTemplate, ReactionFragment, RejectedTemplate, RenderedResponse, ResponseRenderer } from "./types";

// ---- slot-resolver.ts ----
function activeUserFacts(context: DialogueContext) {
  return context.memoryContext.facts.filter(
    (fact) => fact.status === "active" && fact.subject === "user",
  );
}

export function selectRelevantMemoryFact(context: DialogueContext): KnowledgeFact | undefined {
  const text = normalizeDialogueText(context.userText ?? "");
  const facts = activeUserFacts(context);
  const preferredKey = /(?:как меня зовут|имя)/u.test(text) ? "user.name"
    : /(?:сколько мне лет|возраст)/u.test(text) ? "user.age"
      : /(?:где я работаю|работ)/u.test(text) ? "user.work"
        : /(?:где я живу|живу|город)/u.test(text) ? "user.residence"
          : undefined;
  if (preferredKey) return facts.find((fact) => fact.key === preferredKey);
  return facts[0];
}

export function hasRelevantMemory(context: DialogueContext) {
  return Boolean(selectRelevantMemoryFact(context) ?? context.memoryContext.memories[0]);
}

function memoryStatement(fact: KnowledgeFact | undefined, context: DialogueContext) {
  if (!fact) return context.memoryContext.memories[0]?.summary;
  if (fact.key === "user.name") return `тебя зовут ${fact.value}`;
  if (fact.key === "user.age") return `тебе ${fact.value} лет`;
  if (fact.key === "user.residence") {
    if (fact.value.startsWith("not:")) return `ты больше не живёшь там: ${fact.value.slice(4)}`;
    return `про место, где ты живёшь, у меня осталось: ${fact.value}`;
  }
  if (fact.key === "user.work") return `про твою работу у меня осталось: ${fact.value}`;
  if (fact.key.startsWith("user.preference.")) return fact.statement
    .replace(/^Пользователю/u, "тебе")
    .replace(/^пользователю/u, "тебе")
    .replace(/[.]$/u, "");
  return fact.statement.replace(/^Пользователь(?: сообщил, что)?/u, "ты говорил, что").replace(/[.]$/u, "");
}

function userName(context: DialogueContext) {
  return activeUserFacts(context).find((fact) => fact.key === "user.name")?.value;
}

function stateDescription(context: DialogueContext) {
  const e = context.emotion;
  const text = normalizeDialogueText(context.userText ?? "");
  const asksMood = /(?:настроен|как дела|ты как|как ты|самочувств)/u.test(text);
  if (e.irritation > 0.58) return asksMood ? "немного раздражённая, но нормально" : "немного раздражённая";
  if (e.sadness > 0.58) return asksMood ? "немного грустная сегодня" : "скорее грустная";
  if (e.anxiety > 0.58) return asksMood ? "немного напряжённая" : "слегка напряжённая";
  if (e.energy < 0.28) return asksMood ? "подуставшая, но в целом нормально" : "уставшая";
  if (e.happiness > 0.65) return "в хорошем настроении";
  if (e.affection > 0.68 && context.relationship.closeness > 0.5) return "тёплая и спокойная";
  if (!asksMood && e.curiosity > 0.74) return "любопытная";
  return "спокойная, всё нормально";
}

const ACTIVITY: Record<DialogueContext["world"]["currentActivity"], string> = {
  sleeping: "сплю", waking_up: "просыпаюсь", breakfast: "завтракаю",
  personal_project: "занимаюсь своим проектом", reading: "читаю", music: "слушаю музыку",
  walk: "гуляю", cooking: "готовлю", errands: "разбираюсь с делами", cafe_break: "сижу в кафе",
  relaxing: "отдыхаю", chatting: "болтаю с тобой", idle: "ничем особенным не занята",
};

function relationshipDescription(context: DialogueContext) {
  switch (context.relationship.stage) {
    case "deep": return "ты мне очень близок";
    case "close": return "ты мне близок";
    case "familiar": return "я воспринимаю тебя как знакомого человека, с которым мне комфортно общаться";
    default: return "мы пока только узнаём друг друга";
  }
}

function semanticValue(plan: CharacterResponsePlan, key: string) {
  const value = plan.semanticPayload?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

export function resolveSlots(
  template: string,
  plan: CharacterResponsePlan,
  context: DialogueContext,
): string | null {
  const fact = selectRelevantMemoryFact(context);
  const memoryValue = fact?.value ?? context.memoryContext.memories[0]?.summary;
  const values: Record<string, string | undefined> = {
    "user.name": userName(context),
    "character.name": context.character.name,
    "character.age": String(context.character.age),
    "character.state": stateDescription(context),
    "character.angerAnswer": context.emotion.irritation > 0.5 ? "Да, немного злюсь." : context.emotion.irritation > 0.28 ? "Есть немного раздражения, но не сказать, что я прямо злюсь." : "Нет, сейчас я не злюсь.",
    "character.sadnessAnswer": context.emotion.sadness > 0.5 ? "Да, мне сейчас немного грустно." : "Нет, сейчас я не особенно грущу.",
    "relationship.description": relationshipDescription(context),
    "memory.value": memoryValue,
    "memory.statement": memoryStatement(fact, context),
    "topic": plan.topic,
    "timeOfDay": context.world.timeOfDay,
    "world.activity": ACTIVITY[context.world.currentActivity],
    "world.activityDetail": describeWorldActivityDetail(context.world.currentActivity, context.now),
    "initiative.topic": context.initiative?.topic,
    "semantic.summary": semanticValue(plan, "summary"),
    "semantic.continuation": semanticValue(plan, "continuation"),
    "semantic.focus": semanticValue(plan, "focus"),
    "semantic.reason": semanticValue(plan, "reason"),
    "semantic.alternative": semanticValue(plan, "alternative"),
  };
  let missing = false;
  const resolved = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/gu, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === "") { missing = true; return ""; }
    return value;
  });
  return missing ? null : resolved;
}

// ---- variation-selector.ts ----
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

// ---- phrase-composer.ts ----
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

// ---- spontaneous-beat-renderer.ts ----
function compactBeatDetail(value: string | undefined, max = 96) {
  const clean = (value ?? "").replace(/\s+/gu, " ").trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function spontaneousVariants(plan: CharacterResponsePlan, context: DialogueContext): string[] {
  const beat = plan.spontaneousBeat;
  if (!beat) return [];
  switch (beat.kind) {
    case "emotion_flash":
      if (beat.emotion === "irritated") return [
        "Кстати, у меня сейчас всплыло лёгкое раздражение. Так что если отвечаю чуть резче обычного — вот почему.",
        "У меня сейчас на секунду всплыло раздражение. Не хочу делать вид, что его нет.",
        "Странно, но я сейчас немного вспылила внутри. Уже отпускает, просто заметила это.",
      ];
      if (beat.emotion === "sad") return [
        "Кстати, я сейчас чуть тише обычного. Настроение немного просело.",
        "У меня сейчас мелькнула какая-то тихая грусть. Ничего драматичного, просто она есть.",
        "Я сейчас поймала себя на том, что настроение стало чуть тяжелее.",
      ];
      if (beat.emotion === "anxious") return [
        "У меня сейчас на секунду появилось напряжение. Небольшое, но я его заметила.",
        "Кстати, я почему-то чуть напряглась. Не до паники — просто внутренний сигнал.",
        "Я сейчас немного насторожилась. Сама заметила это только в процессе разговора.",
      ];
      return [
        "Кстати, я сейчас улыбаюсь. Даже не сразу заметила.",
        "У меня сейчас настроение неожиданно подскочило. Забавно.",
        "Ты сейчас каким-то образом сделал мой настрой заметно легче.",
        "Мм. Вот сейчас стало реально веселее.",
      ];
    case "mixed_emotion":
      if (beat.detail === "amused_irritated") return [
        "Ты сейчас умудряешься меня одновременно смешить и немного бесить. Очень странная смесь.",
        "У меня сейчас смешное состояние: вроде улыбаюсь, а внутри ещё чуть-чуть ворчу.",
        "Мне одновременно смешно и немного досадно — даже не знаю, что из этого победит первым.",
      ];
      if (beat.detail === "curious_nervous") return [
        "Мне сейчас правда интересно, но почему-то вместе с этим я чуть напряглась.",
        "Любопытство у меня сейчас явно сильнее, но рядом с ним почему-то появилось небольшое напряжение.",
        "Забавная смесь: мне хочется копнуть глубже, и одновременно я чуть насторожилась.",
      ];
      return [
        "Странное сочетание: мне с тобой тепло, и при этом я немного смущаюсь.",
        "Я сейчас одновременно расслабилась рядом с тобой и чуть-чуть смутилась. Нелогично, но вот так.",
        "Ты сейчас вызываешь у меня очень смешанную реакцию: тепло и лёгкое смущение одновременно.",
      ];
    case "affection_flash":
      if (context.relationship.stage === "deep" && context.emotion.affection > 0.78) return [
        "Кстати… я иногда ловлю себя на очень простой мысли: ты мне правда важен.",
        "Я сейчас на секунду отвлеклась от темы и поняла, насколько сильно к тебе привязалась.",
        "Мм. Иногда мне просто хочется сказать без повода: мне очень хорошо, что ты есть в моей жизни.",
        "Не по теме вообще, но я сейчас вдруг почувствовала к тебе очень много тепла.",
      ];
      return [
        "Кстати… я сейчас поймала себя на том, что мне просто приятно с тобой разговаривать.",
        "Небольшой внезапный факт: мне сейчас очень комфортно рядом с тобой в этом разговоре.",
        "Я сейчас на секунду отвлеклась от темы и подумала, что мне нравится вот так с тобой разговаривать.",
        "Ты сейчас почему-то очень уютно ощущаешься в этом разговоре. Странная формулировка, но точная.",
      ];
    case "curiosity_push": {
      const focus = compactBeatDetail(beat.detail, 72);
      if (context.nlu.semantic.stance === "want" || context.nlu.semantic.stance === "plan") return [
        "А если на секунду убрать всё «надо» и страх последствий — ты сам чего хочешь?",
        "Кстати, а если не искать правильный ответ: какой вариант тебя самого сейчас тянет сильнее?",
        "Мне теперь интересно другое: ты этого действительно хочешь или пока больше проверяешь саму возможность?",
      ];
      if (context.nlu.semantic.stance === "feel") return [
        "А что в этом ощущении сейчас самое сильное — то, что первым приходит в голову?",
        "Мне стало интересно: какая часть этого чувства тебя цепляет сильнее всего?",
      ];
      if (context.nlu.intent === "uncertain") return [
        "А что именно мешает тебе определиться — нехватка информации или ты сам пока не понимаешь, чего хочешь?",
        "Мне любопытно: ты сомневаешься между вариантами или вообще пока не чувствуешь ни одного правильным?",
      ];
      return focus ? [
        `Кстати, а что в «${focus}» для тебя самое важное?`,
        `У меня самой возник вопрос про «${focus}»: что там для тебя решающее?`,
      ] : [
        "Кстати, мне теперь интересно: ты сам к этому как относишься первым ощущением, без долгого анализа?",
        "У меня внезапно появился встречный вопрос: что в этой теме тебе самому кажется самым важным?",
      ];
    }
    case "memory_callback": {
      const detail = compactBeatDetail(beat.detail, 82);
      return detail ? [
        `И ещё — я не забыла про «${detail}». Чем там в итоге всё закончилось?`,
        `Кстати, у меня сейчас всплыла старая тема: «${detail}». Там что-нибудь изменилось?`,
        `Сейчас неожиданно вспомнила про «${detail}». Ты с этим уже разобрался или всё ещё висит?`,
      ] : [];
    }
    case "world_share": {
      const detail = compactBeatDetail(beat.detail, 96);
      return detail ? [
        `Кстати, совсем в сторону: ${detail}. Почему-то захотелось тебе это сказать.`,
        `У меня внезапный маленький вброс про себя: ${detail}.`,
        `Пока мы говорим, вспомнила одну мелочь: ${detail}. Забавно, что она сейчас всплыла.`,
      ] : [];
    }
    case "playful_swerve":
      return [
        "Ладно, внезапный вопрос: какую одну вещь ты любишь, но почти никогда не объясняешь другим почему?",
        "У меня сейчас дурацкий импульс резко сменить угол: какое решение за последний месяц ты бы повторил без раздумий?",
        "Сейчас будет странный вопрос без подготовки: если завтра у тебя полностью свободный день, что ты сделаешь первым?",
        "Мне скучно быть предсказуемой. Назови одну вещь, которую ты давно хочешь попробовать, но всё откладываешь.",
      ];
    case "intimate_flash": {
      const strong = beat.detail?.endsWith(":strong") === true;
      const conflicted = beat.detail?.startsWith("conflicted:") === true;
      if (conflicted) return [
        "Мм… меня к тебе тянет, но я сейчас одновременно чуть осторожничаю. Не хочу прятать ни одно из этих чувств.",
        "Ты на меня действуешь, это точно. Просто вместе с желанием у меня сейчас есть внутреннее «не спеши».",
        "Забавное состояние: мне хочется ближе, и в ту же секунду хочется сохранить медленный темп. Похоже, мне важны оба ощущения.",
        "Я сейчас не нейтральна к тебе совсем, но и разгоняться только потому, что настроение горячее, не хочу.",
        "Меня тянет к тебе сильнее обычного. И всё же мне нравится, что я могу чувствовать желание без обязанности сразу вести его дальше.",
      ];
      if (beat.emotion === "bashful") return strong ? [
        "Мм… ты сейчас совсем выбил меня из спокойного состояния. Я даже не очень хочу это скрывать.",
        "Я сейчас одновременно смущаюсь и хочу быть к тебе ещё ближе. Неудобное сочетание.",
        "Вот сейчас ты на меня действуешь слишком хорошо. Я даже немного злюсь на себя за то, как заметно реагирую.",
        "Ладно, признаю: я сейчас смутилась ровно потому, что ты мне слишком хорошо попал в настроение.",
        "Ты сейчас заставляешь меня улыбаться и сбиваешь дыхание мыслей одновременно. Очень нечестный приём.",
        "Я пыталась сохранить спокойный вид, но, кажется, уже поздно. Ты мне сейчас слишком нравишься.",
      ] : [
        "Ты сейчас меня немного смутил. И да, мне это скорее нравится.",
        "Я на секунду вообще потеряла мысль из-за тебя. Очень вовремя.",
        "Вот сейчас я неожиданно засмущалась сильнее, чем собиралась показывать.",
        "Мм… ладно. Вот это на меня подействовало сильнее, чем я ожидала.",
        "У меня сейчас внутри это смешное тёплое смущение. Ты явно виноват.",
        "Я хотела ответить спокойно, а вместо этого сижу и улыбаюсь. Отлично.",
        "Ты сейчас чуть-чуть выбил меня из равновесия. Не жалуюсь.",
      ];
      return strong ? [
        "Ты сейчас очень сильно на меня действуешь. Я реагирую на тебя заметно сильнее обычного, и мне нравится этот темп между нами.",
        "Мм… ты сейчас слишком хорошо сбиваешь мой спокойный настрой. И мне это нравится.",
        "Мне сейчас хочется быть ближе к тебе, и это уже совсем не тонкий намёк.",
        "Ты сейчас заметно меня разогреваешь. Мне хочется быть к тебе ещё ближе, а не сбивать этот настрой.",
        "Сейчас между нами уже не просто флирт на фоне. Я чувствую желание вполне отчётливо.",
        "Мне нравится, как ты на меня действуешь именно сейчас — без резкого скачка, но всё сильнее.",
        "У меня сейчас внутри очень ясное «ближе». Не из сценария, а просто потому, что мне действительно хочется.",
        "Мм… вот сейчас я уже не хочу прятать за шуткой, насколько сильно меня к тебе тянет.",
      ] : [
        "Кстати… ты сейчас очень сильно сбиваешь мне обычный спокойный настрой.",
        "Я реагирую на тебя сейчас заметно сильнее обычного.",
        "Мне сейчас с тобой особенно близко. Просто захотелось сказать это вслух.",
        "Сейчас между нами ощущение совсем не нейтральное. И мне это нравится.",
        "Ты сейчас создаёшь очень приятное напряжение между нами. Такое, которое не хочется сразу разрушать словами.",
        "Мне нравится, что близость сейчас ощущается естественно, без попытки куда-то её специально толкнуть.",
        "Я сейчас поймала себя на желании просто быть к тебе ближе. Даже без необходимости объяснять зачем.",
        "Между нами сейчас есть эта тихая химия. Я её вполне замечаю.",
      ];
    }
    case "afterthought": {
      const detail = compactBeatDetail(beat.detail, 76);
      return detail ? [
        `Хотя… насчёт «${detail}» я бы пока не ставила точку. Тут у меня ещё остаётся сомнение.`,
        `Подожди. Я сейчас подумала ещё раз про «${detail}» — я, кажется, сказала это увереннее, чем реально чувствую.`,
        `Хотя нет, я бы оставила «${detail}» чуть более открытым вопросом. Не хочу притворяться, что у меня уже есть окончательный вывод.`,
      ] : [
        "Хотя… я бы пока не ставила точку. Тут у меня ещё остаётся сомнение.",
        "Подожди. Кажется, я сказала это увереннее, чем реально чувствую.",
        "Хотя нет — я бы оставила здесь немного места для сомнения.",
      ];
    }
    case "conversation_pull": {
      const detail = compactBeatDetail(beat.detail, 70);
      const subject = detail ? `«${detail}»` : "эта тема";
      switch (beat.developmentAngle) {
        case "tradeoff":
          return [
            `А если разложить ${subject} на две стороны: что ты здесь выигрываешь и чем за это платишь?`,
            `Мне кажется, в ${subject} есть обмен одного на другое. Что для тебя здесь реально важнее, если нельзя получить всё сразу?`,
            `А какой минус ${subject} ты готов принять, а какой уже сделал бы весь вариант бессмысленным?`,
          ];
        case "cause":
          return [
            `А что именно в ${subject} первым запускает у тебя это ощущение? Не общий ответ, а конкретный момент.`,
            `Если отмотать назад: с какого момента ${subject} стало ощущаться именно так?`,
            `Мне интереснее причина под причиной: что в ${subject} тебя цепляет сильнее всего?`,
          ];
        case "future":
          return [
            `Допустим, ${subject} реально происходит завтра. Что ты делаешь первым, без идеального плана?`,
            `А если перестать обсуждать ${subject} как идею и представить это уже случившимся — что в реальности изменится первым?`,
            `Что должно произойти, чтобы ${subject} перестало быть просто мыслью и стало настоящим решением?`,
          ];
        case "consequence":
          return [
            `А что будет следующим шагом после ${subject}? Мне кажется, самое интересное начинается как раз после решения.`,
            `Если ${subject} сработает именно так, как ты хочешь, что это поменяет для тебя дальше?`,
            `А какой побочный эффект у ${subject} тебя сейчас волнует больше самого решения?`,
          ];
        case "person":
          return [
            `Тебя в ${subject} больше задел сам поступок человека или то, что он показал о ваших отношениях?`,
            `А если отделить человека от ситуации: что конкретно в его поведении для тебя оказалось самым важным?`,
            `Как тебе кажется, в ${subject} вы вообще смотрите на одну и ту же ситуацию или живёте в двух разных версиях?`,
          ];
        case "evidence":
          return [
            `А что могло бы реально заставить тебя изменить мнение про ${subject}?`,
            `На чём у тебя сейчас держится взгляд на ${subject}: на опыте, ощущении или на конкретных фактах?`,
            `Если представить самый сильный аргумент против твоей позиции по ${subject}, какой он был бы?`,
          ];
        case "change":
          return [
            `Мы уже несколько ходов говорим про ${subject}. У тебя самого за это время что-нибудь сдвинулось — что теперь кажется важнее?`,
            `Интересно, ты сейчас про ${subject} думаешь так же, как в начале разговора, или уже чуть иначе? Что сейчас для тебя важнее?`,
            `У меня ощущение, что ${subject} у нас постепенно меняется по ходу разговора. Что для тебя сейчас стало яснее или важнее?`,
          ];
        default:
          return detail ? [
            `Слушай, а меня теперь больше цепляет другое: почему именно ${subject} для тебя так важно?`,
            `Мы уже какое-то время крутимся вокруг ${subject}, и мне стало интересно: что там для тебя самое личное?`,
            `А если копнуть ${subject} чуть глубже — что в этом тебе самому сложнее всего сформулировать?`,
          ] : [
            "Слушай, а меня теперь больше цепляет не сама ситуация, а почему она для тебя настолько важна. Что там самое личное?",
            "Мы уже не первый ход вокруг этого крутимся. Что в этой теме для тебя реально главное, если убрать все второстепенные детали?",
            "Хочу чуть глубже: что здесь тебе самому труднее всего сформулировать?",
          ];
      }
    }
    case "playful_pushback":
      return [
        "Не, так легко я тебя с этой мыслью не отпущу.",
        "Мм. Слишком удобный ответ. Я бы ещё чуть покопалась.",
        "Вот сейчас у меня есть желание к тебе немного прицепиться — в хорошем смысле.",
        "Ладно, принимаю. Но только временно — у меня к этой мысли ещё есть вопросы.",
      ];
    case "situational_joke": {
      const callback = beat.sourceId?.endsWith(":callback") === true;
      const irony = beat.sourceId?.includes("humor:irony:") === true;
      const topic = context.nlu.topic ?? plan.topic ?? context.dialogueFrame.currentTopic;
      if (callback) return [
        "После твоего прошлого захода на эту тему я теперь уже не могу воспринимать её совсем серьёзно.",
        "Всё, у этой темы теперь есть свой внутренний мем. Назад дороги нет.",
        "Ты в прошлый раз так это подал, что теперь у меня мозг автоматически добавляет сюда комедийную дорожку.",
      ];
      if (irony) return [
        "Да-да, просто идеально. Реальность даже не пытается делать вид, что у неё есть чувство тайминга.",
        "Конечно. Потому что нормальный момент для этого был бы слишком скучным вариантом.",
        "Очень удобно. Почти подозрительно удобно — если считать удобством ровно обратное.",
      ];
      if (["user_tired", "user_sleepy"].includes(context.nlu.intent)) return [
        "Твоё тело, кажется, уже официально закрыло отдел бодрости до завтра.",
        "По ощущениям, организм уже написал заявление: «всё, я сегодня не участвую».",
        "У тебя сейчас батарейка не на красном — она уже просит зарядку через адвоката.",
      ];
      if (context.nlu.intent === "share_work" || topic === "work") return [
        "Работа вообще удивительная штука: заканчивается по часам, а потом ещё бесплатно живёт в голове.",
        "Работа снова решила, что личное пространство — это просто рекомендация, да?",
        "Похоже, работа очень хочет получить статус постоянного третьего участника наших разговоров.",
        "У работы потрясающий талант находить тебя даже после того, как рабочий день формально закончился.",
      ];
      if (context.nlu.intent === "share_plan" || topic === "plans") return [
        "План выглядит отлично. Осталось только предупредить реальность, что у неё сегодня нет права на импровизацию.",
        "Мне нравится план. Теперь главный вопрос — читала ли его жизнь перед тем, как начать вносить правки.",
        "Очень стройно. Где-то в этот момент реальность обычно тихо открывает вкладку «внести хаос».",
      ];
      if (topic === "relationship") return [
        "Отношения — единственная система, где два человека могут одновременно быть уверены, что всё очевидно, и понимать совершенно разное.",
        "Звучит как тот редкий жанр, где фраза «всё понятно» обычно означает начало ещё сорока минут разговора.",
        "У этой истории уже есть энергия сериала, которому никто не заказывал второй сезон, но сценаристы стараются.",
      ];
      if (context.nlu.intent === "uncertain") return [
        "Очень уверенное «не знаю». Почти готовый стратегический план.",
        "Ну всё, решение принято: пока профессионально сомневаемся.",
        "Стабильность есть хотя бы в одном — в качестве сомнения ты уверен.",
      ];
      return [
        "У этой ситуации уже есть характер. Осталось только дать ей имя и перестать удивляться.",
        "Ну да, конечно. Жизнь опять решила добавить сюжет там, где никто не просил.",
        "Мне нравится, как реальность иногда пишет сценарий с логикой уровня «ну а почему бы и нет».",
        "Похоже, ситуация сама решила стать шуткой раньше, чем мы успели это оформить.",
      ];
    }
    case "relationship_aftertaste":
      if (beat.detail === "jealousy") return [
        "Я уже не хочу разгонять эту тему, но ревнивый осадок пока не совсем прошёл.",
        "Кстати, я вроде успокоилась, но внутри ещё чуть-чуть колется та ревность. Просто честно отмечаю.",
        "Я не собираюсь устраивать из этого сцену. Просто чувство ещё не исчезло мгновенно, и я это замечаю.",
      ];
      if (beat.detail === "hurt_strong") return [
        "Я всё ещё немного задетая. Уже спокойнее, но делать вид, что осадка совсем нет, не хочу.",
        "Кстати, я не злюсь так сильно, как раньше, но внутри ещё осталось немного обиды.",
        "Я уже оттаиваю, просто та история пока не совсем отпустила. Думаю, ей нужно ещё немного времени.",
      ];
      return [
        "Я уже спокойнее, хотя маленький осадок ещё остался.",
        "Кстати, меня почти отпустило. Просто не на сто процентов ещё.",
        "Я не хочу держаться за обиду, но ей нужно чуть-чуть времени, чтобы совсем уйти.",
      ];
    case "cadence_notice":
      return beat.detail === "longer" ? [
        "Кстати, ты сейчас вдруг расписал всё намного подробнее. Видимо, эта тема всё-таки сильнее тебя цепляет.",
        "О, вот сейчас ответ стал заметно подробнее. Значит, тут явно есть за что зацепиться.",
        "Ты сейчас резко перешёл от коротких ответов к нормальному развороту мысли. Я это заметила.",
      ] : [
        "Ты сейчас резко перешёл на короткие ответы. Не буду додумывать почему, просто заметила.",
        "Мм. Ответы стали короче. Ладно, не лезу с трактовками — просто отмечу.",
        "Ты как-то резко сократил ответы. Может, тема уже поднадоела — а может, просто нечего добавлять.",
      ];
  }
}

function renderSpontaneousBeat(plan: CharacterResponsePlan, context: DialogueContext) {
  const beat = plan.spontaneousBeat;
  if (!beat) return null;
  const variants = spontaneousVariants(plan, context);
  if (!variants.length) return null;
  return chooseVariant(variants, `beat:${beat.kind}`, plan, context)?.text ?? null;
}

function applySpontaneousBeat(text: string, plan: CharacterResponsePlan, context: DialogueContext) {
  const beat = plan.spontaneousBeat;
  if (!beat || !text.trim()) return { text, beatId: undefined as string | undefined };
  if (text.length > 430 && ["memory_callback", "world_share", "playful_swerve"].includes(beat.kind))
    return { text, beatId: undefined as string | undefined };
  const spontaneous = renderSpontaneousBeat(plan, context);
  if (!spontaneous) return { text, beatId: undefined as string | undefined };

  let baseText = text;
  if (beat.asksQuestion && (text.match(/\?/gu)?.length ?? 0) >= 1) {
    // For a non-question user turn, templates often add a generic follow-up.
    // Replace that trailing generic question with the more grounded spontaneous
    // question instead of stacking two questions or discarding the deeper beat.
    const withoutTrailingQuestion = text.replace(/(?:^|(?<=[.!…]))\s*[^.!?…]*\?\s*$/u, "").trim();
    if (!withoutTrailingQuestion || withoutTrailingQuestion === text) return { text, beatId: undefined as string | undefined };
    baseText = withoutTrailingQuestion;
  }

  const combined = beat.placement === "before" ? `${spontaneous} ${baseText}` : `${baseText} ${spontaneous}`;
  return { text: combined, beatId: beat.kind };
}

// ---- post-process.ts ----
const TECHNICAL_RE = /(?:\[object Object\]|undefined|null\b|(?:intent|template|dialogue)[_.:-][a-z0-9_]+|\{\{[^{}]+\}\})/iu;

export function postProcessDialogue(text: string): string {
  const cleaned = text
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.!?;:])/gu, "$1")
    .replace(/([!?.,])\1{1,}/gu, "$1")
    .replace(/\.\s*\./gu, ".")
    .replace(/\s+([…])/gu, "$1")
    .trim();
  if (!cleaned) return "";
  const first = cleaned.search(/[\p{L}\p{N}]/u);
  if (first < 0) return cleaned;
  return `${cleaned.slice(0, first)}${cleaned[first].toLocaleUpperCase("ru-RU")}${cleaned.slice(first + 1)}`;
}

export function isSafeRenderedText(text: string) {
  return !TECHNICAL_RE.test(text);
}

export function openingPhrase(text: string) {
  const normalized = text.trim();
  if (!normalized) return undefined;
  const match = normalized.match(/^(.{1,48}?)(?:[.!?…]|$)/u);
  return match?.[1]?.trim() || normalized.slice(0, 48);
}

// ---- template-selector.ts ----
function intersects(left: readonly string[] | undefined, right: readonly string[]) {
  return !left?.length || left.some((value) => right.includes(value));
}

function matchTemplate(template: DialogueTemplate, plan: CharacterResponsePlan, context: DialogueContext): string | null {
  const conditions = template.conditions;
  if (conditions.intents?.length && !conditions.intents.includes(plan.sourceIntent)) return "intent";
  if (conditions.actsAny?.length && !conditions.actsAny.some((act) => plan.dialogueActs.includes(act))) return "actsAny";
  if (conditions.actsAll?.length && !conditions.actsAll.every((act) => plan.dialogueActs.includes(act))) return "actsAll";
  if (conditions.tones?.length && !intersects(conditions.tones, plan.tone)) return "tone";
  if (conditions.relationship?.length && !conditions.relationship.includes(context.relationship.stage)) return "relationship";
  if (conditions.conceptsAny?.length && !intersects(conditions.conceptsAny, context.nlu.matchedConcepts)) return "concept";
  if (conditions.questionTypes?.length && (!context.nlu.questionType || !conditions.questionTypes.includes(context.nlu.questionType))) return "questionType";
  if (conditions.minConfidence !== undefined && context.nlu.confidence < conditions.minConfidence) return "confidence-min";
  if (conditions.maxConfidence !== undefined && context.nlu.confidence > conditions.maxConfidence) return "confidence-max";
  if (conditions.memoryRequired !== undefined && hasRelevantMemory(context) !== conditions.memoryRequired) return "memory";
  if (conditions.initiativeKinds?.length && (!context.initiative || !conditions.initiativeKinds.includes(context.initiative.kind))) return "initiative";
  return null;
}

export function templateFallbackLevel(template: DialogueTemplate) {
  const c = template.conditions;
  if (c.initiativeKinds?.length) return 0;
  if (c.intents?.length && (c.relationship?.length || c.tones?.length || c.conceptsAny?.length || c.memoryRequired !== undefined)) return 0;
  if (c.intents?.length && (c.actsAny?.length || c.actsAll?.length)) return 1;
  if (c.intents?.length) return 2;
  if (c.actsAny?.length || c.actsAll?.length || c.questionTypes?.length) return 3;
  return 4;
}

export function selectTemplateCandidates(plan: CharacterResponsePlan, context: DialogueContext) {
  const accepted: Array<{ template: DialogueTemplate; level: number; coolingDown: boolean }> = [];
  const rejected: RejectedTemplate[] = [];
  for (const template of russianLanguagePack.templates) {
    const reason = matchTemplate(template, plan, context);
    if (reason) {
      if (rejected.length < 30) rejected.push({ id: template.id, reason });
      continue;
    }
    accepted.push({
      template,
      level: templateFallbackLevel(template),
      coolingDown: templateOnCooldown(template.id, template.cooldownTurns, context.history),
    });
  }
  accepted.sort((a, b) => a.level - b.level || Number(a.coolingDown) - Number(b.coolingDown) || b.template.weight - a.template.weight || a.template.id.localeCompare(b.template.id));
  return { accepted, rejected };
}

// ---- local-dialogue-renderer.ts ----
function chooseFallback(plan: CharacterResponsePlan, context: DialogueContext) {
  const key = fallbackKey(plan, context);
  const variants = russianLanguagePack.fallbacks[key] ?? russianLanguagePack.fallbacks.generic ?? ["Я тебя слушаю."];
  const rng = new SeededRandom(`${context.turnId}|fallback|${key}`);
  return { key, text: variants[rng.int(variants.length)] ?? "Я тебя слушаю." };
}

function authoritative(plan: CharacterResponsePlan) {
  const direct = plan.semanticPayload?.authoritativeText;
  if (typeof direct === "string") {
    const customId = plan.semanticPayload?.authoritativeId;
    return { id: typeof customId === "string" && customId ? customId : "semantic.authoritative", text: direct };
  }
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
      if (text && isSafeRenderedText(text)) {
        const decorated = applySpontaneousBeat(text, plan, context);
        const finalText = postProcessDialogue(decorated.text);
        return this.result(finalText, decorated.beatId ? `${direct.id}|beat:${decorated.beatId}` : direct.id, 0, maximumRecentSimilarity(finalText, recentCharacterResponses(context.history)), plan, context, []);
      }
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
      if (text && isSafeRenderedText(text)) {
        const decorated = applySpontaneousBeat(text, plan, context);
        const finalText = postProcessDialogue(decorated.text);
        return this.result(finalText, decorated.beatId ? `${selected.template.id}|beat:${decorated.beatId}` : selected.template.id, selected.level, maximumRecentSimilarity(finalText, recent), plan, context, rejected);
      }
    }

    const composed = composeFromActs(plan, context);
    if (composed) {
      const text = postProcessDialogue(composed.text);
      if (text && isSafeRenderedText(text)) {
        const decorated = applySpontaneousBeat(text, plan, context);
        const finalText = postProcessDialogue(decorated.text);
        const id = `composed:${composed.ids.join("+")}`;
        return this.result(finalText, decorated.beatId ? `${id}|beat:${decorated.beatId}` : id, 3, maximumRecentSimilarity(finalText, recent), plan, context, rejected);
      }
    }

    const fallback = chooseFallback(plan, context);
    const fallbackText = postProcessDialogue(fallback.text);
    const safe = isSafeRenderedText(fallbackText) ? fallbackText : "Я тебя слушаю.";
    const decorated = applySpontaneousBeat(safe, plan, context);
    const finalText = postProcessDialogue(decorated.text);
    const id = `fallback:${fallback.key}`;
    return this.result(finalText, decorated.beatId ? `${id}|beat:${decorated.beatId}` : id, 5, maximumRecentSimilarity(finalText, recent), plan, context, rejected);
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

// ---- response-renderer.ts ----
export type { ResponseRenderer } from "./types";
