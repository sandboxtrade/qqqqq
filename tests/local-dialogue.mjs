import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const candidate = new URL(specifier, context.parentURL);
      if (!candidate.pathname.match(/\.[a-z0-9]+$/iu) && existsSync(fileURLToPath(candidate) + ".ts"))
        return { url: candidate.href + ".ts", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith(".ts")) return next(url, context);
    return {
      source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "transform" }),
      format: "module",
      shortCircuit: true,
    };
  },
});

const {
  analyzeLocalNLU,
  applyLocalNLUToPerception,
  buildDialogueContext,
  buildDialogueFrame,
  localDialogueRenderer,
  planLocalDialogue,
  resolveContextualNLU,
} = await import("../src/local-dialogue/index.ts");
const { russianLanguagePack } = await import("../src/local-dialogue/language-pack.ts");
const { localPerception, interpret, decide, planResponse } = await import("../src/cognition/local-cognition.ts");
const { defaultCharacter } = await import("../src/character/character.ts");
const { initialEmotionalState, deriveMood } = await import("../src/emotions/emotions.ts");
const { initialRelationshipState } = await import("../src/relationship/relationship.ts");
const { createInitialWorldState } = await import("../src/world/world.ts");
const { createInitialIntimacyState } = await import("../src/intimacy/intimacy.ts");

let count = 0;
async function test(name, fn) {
  await fn();
  count += 1;
  console.log(`✓ ${name}`);
}

const EMPTY_MEMORY = { memories: [], facts: [], openThreads: [] };
const NOW = 1_800_000_000_000;

function relationship(stage = "new") {
  const values = {
    new: { trust: 0.3, closeness: 0.25, attachment: 0.18, security: 0.35 },
    familiar: { trust: 0.52, closeness: 0.48, attachment: 0.38, security: 0.55 },
    close: { trust: 0.72, closeness: 0.7, attachment: 0.62, security: 0.68 },
    deep: { trust: 0.9, closeness: 0.9, attachment: 0.86, security: 0.84 },
  }[stage];
  return { ...initialRelationshipState, ...values, stage, updatedAt: NOW };
}

function emotion(patch = {}) {
  const next = { ...initialEmotionalState, updatedAt: NOW, ...patch };
  next.mood = deriveMood(next);
  return next;
}

function fact(key, value, statement = value) {
  return {
    id: `fact_${key}`,
    subject: "user",
    key,
    statement,
    value,
    confidence: 0.94,
    evidenceCount: 2,
    sourceEventIds: ["event_1"],
    sourceMemoryIds: ["memory_1"],
    createdAt: NOW - 1000,
    updatedAt: NOW - 500,
    lastConfirmedAt: NOW - 500,
    validFrom: NOW - 1000,
    status: "active",
  };
}

async function renderTurn({
  text,
  turnId = `turn_${Math.random().toString(16).slice(2)}`,
  history = [],
  memoryContext = EMPTY_MEMORY,
  relationshipState = relationship("new"),
  emotionState = emotion(),
  intimacyState = undefined,
} = {}) {
  const initialNlu = analyzeLocalNLU(text);
  const frame = buildDialogueFrame(history, initialNlu);
  const nlu = resolveContextualNLU(initialNlu, frame, text);
  const perception = applyLocalNLUToPerception(
    localPerception(text, history.slice(-6).map(({ role, text: lineText }) => ({ role, text: lineText }))),
    nlu,
  );
  const world = createInitialWorldState(NOW, "Europe/Amsterdam");
  const interpretation = interpret(perception, memoryContext, emotionState, relationshipState);
  const decision = decide(defaultCharacter, perception, interpretation, emotionState, relationshipState, world);
  const responsePlan = planResponse(defaultCharacter, perception, interpretation, decision, emotionState, world);
  const context = buildDialogueContext({
    userText: text,
    turnId,
    now: NOW,
    character: defaultCharacter,
    emotion: emotionState,
    relationship: relationshipState,
    world,
    intimacy: intimacyState,
    memoryContext,
    history,
    nlu,
    perception,
    decision,
    responsePlan,
  });
  const plan = planLocalDialogue(context);
  const rendered = await localDialogueRenderer.render(plan, context);
  return { nlu, perception, decision, responsePlan, context, plan, rendered };
}

function assertSafeText(text, allowEmpty = false) {
  if (!allowEmpty) assert.ok(text.trim().length > 0, "reply must not be empty");
  assert.doesNotMatch(text, /undefined|\[object Object\]|\{\{|\}\}|template[_:. -]|dialogue[_:. -]|intent[_:. -]/iu);
}

await test("language pack validates and contains a production-sized first Russian set", () => {
  assert.deepEqual(russianLanguagePack.issues, []);
  assert.ok(russianLanguagePack.intents.length >= 40);
  assert.ok(russianLanguagePack.templates.length >= 30);
  assert.equal(new Set(russianLanguagePack.intents.map((item) => item.id)).size, russianLanguagePack.intents.length);
  assert.equal(new Set(russianLanguagePack.templates.map((item) => item.id)).size, russianLanguagePack.templates.length);
});

const canonicalScenarios = [];
for (const definition of russianLanguagePack.intents) {
  if (["statement", "unknown"].includes(definition.id)) continue;
  for (const phrase of definition.patterns.phrases.slice(0, 2)) canonicalScenarios.push([phrase, definition.id]);
}
assert.ok(canonicalScenarios.length >= 100, `expected >=100 canonical scenarios, got ${canonicalScenarios.length}`);

await test(`${canonicalScenarios.length} canonical NLU scenarios classify to their declared intent`, () => {
  const failures = [];
  for (const [text, expected] of canonicalScenarios) {
    const actual = analyzeLocalNLU(text).intent;
    if (actual !== expected) failures.push({ text, expected, actual });
  }
  assert.deepEqual(failures, []);
});

await test("required NLU examples and confidence contract", () => {
  const required = [
    ["Привет", "greeting"], ["Как дела?", "ask_character_state"], ["Я устал", "user_tired"],
    ["Мне грустно", "user_sad"], ["Сегодня было круто", "share_good_event"], ["Ты злишься?", "ask_character_state"],
    ["Ты меня любишь?", "ask_relationship"], ["А почему?", "ask_why"], ["Да", "short_yes"], ["Нет", "short_no"],
    ["А ты?", "ask_followup"], ["Что я тебе вчера говорил?", "memory_question"], ["Помнишь, где я работаю?", "ask_user_memory"],
    ["Я ухожу спать", "good_night"], ["Доброе утро", "good_morning"], ["Я вернулся", "return_after_absence"],
    ["Извини", "apology"], ["Спасибо", "thanks"], ["Отстань", "boundary_request"],
  ];
  for (const [text, intent] of required) {
    const result = analyzeLocalNLU(text);
    assert.equal(result.intent, intent, text);
    assert.ok(result.confidence >= 0 && result.confidence <= 1, text);
    assert.ok(result.intensity >= 0 && result.intensity <= 1, text);
  }
});

await test("colloquial Russian, abbreviations and light typos stay understandable", () => {
  const cases = [
    ["Ты как?", "ask_character_state"],
    ["Ну как настроение?", "ask_character_state"],
    ["че делаешь", "ask_character_activity"],
    ["чем занята", "ask_character_activity"],
    ["не спишь?", "ask_character_activity"],
    ["привееет", "greeting"],
    ["спс", "thanks"],
    ["пон", "acknowledgement"],
    ["ясно", "acknowledgement"],
    ["нееет", "short_no"],
    ["дааа", "short_yes"],
    ["хз", "uncertain"],
    ["мб", "uncertain"],
    ["я заебался", "user_tired"],
    ["сил нет", "user_tired"],
    ["меня бомбит", "user_angry"],
    ["мне хреново", "user_sad"],
    ["не выспался", "user_sleepy"],
    ["что думаешь обо мне?", "ask_character_opinion"],
    ["настроние как?", "ask_character_state"],
    ["чем занимаешся?", "ask_character_activity"],
    ["как тебя завут?", "ask_character_name"],
  ];
  for (const [text, expected] of cases) {
    const result = analyzeLocalNLU(text);
    assert.equal(result.intent, expected, text);
    assert.ok(result.confidence >= 0.6, `${text}: confidence ${result.confidence}`);
  }
});

await test("messy everyday Russian and one-two character typos are understood", () => {
  const cases = [
    ["как тебя завут", "ask_character_name"],
    ["чем занимаешся", "ask_character_activity"],
    ["чо делаеш", "ask_character_activity"],
    ["настроние как", "ask_character_state"],
    ["у тя как дела", "ask_character_state"],
    ["мне грусно", "user_sad"],
    ["я усталл", "user_tired"],
    ["я чет устал", "user_tired"],
    ["че по настроению", "ask_character_state"],
    ["побудь со мной", "ask_for_support"],
    ["без понятия", "uncertain"],
    ["ну понятно", "acknowledgement"],
    ["ладн", "acknowledgement"],
  ];
  for (const [text, expected] of cases) {
    const result = analyzeLocalNLU(text);
    assert.equal(result.intent, expected, text);
    assert.ok(result.confidence >= 0.55, `${text}: confidence ${result.confidence}`);
  }
});

await test("screenshot regressions no longer turn clear short messages into clarification", async () => {
  const stateQuestions = ["Ты как?", "Ну как настроение?", "настроние как?"];
  for (const text of stateQuestions) {
    const result = await renderTurn({ text, turnId: `screen_${text}` });
    assert.equal(result.nlu.intent, "ask_character_state", text);
    assert.notEqual(result.decision.action, "ask", text);
    assert.doesNotMatch(result.rendered.text, /что именно|не совсем поняла|потеряла/iu, text);
  }

  const history = [
    { role: "user", text: "Ну как настроение?", timestamp: NOW - 2000 },
    { role: "character", text: "Нормально. Сейчас я спокойная.", timestamp: NOW - 1000 },
  ];
  const acknowledged = await renderTurn({ text: "Понял", turnId: "screen_ack", history });
  assert.equal(acknowledged.nlu.intent, "acknowledgement");
  assert.notEqual(acknowledged.decision.action, "ask");
  assert.doesNotMatch(acknowledged.rendered.text, /про что именно|не совсем поняла|уточн/iu);

  const name = await renderTurn({ text: "Как тебя завут?", turnId: "screen_name" });
  assert.equal(name.nlu.intent, "ask_character_name");
  assert.match(name.rendered.text, /Yuzuki/iu);
  assert.doesNotMatch(name.rendered.text, /каждый раз|переспрашивать/iu);
});

await test("short questions about Yuzuki's own previous reaction resolve the referent instead of asking for rephrase", async () => {
  const history = [
    { role: "user", text: "И милая", timestamp: NOW - 4000 },
    { role: "character", text: "Это сейчас был флирт, да?", timestamp: NOW - 3000, dialogueActs: ["FLIRT", "ASK"] },
    { role: "user", text: "Не знаю даже", timestamp: NOW - 2000 },
    { role: "character", text: "Ясно. Вот это уже интересно.", timestamp: NOW - 1000, dialogueActs: ["ACKNOWLEDGE", "CURIOSITY"] },
  ];
  for (const text of ["Что интересно?", "А что интересно?", "В смысле?", "Что именно?"]) {
    const result = await renderTurn({ text, turnId: `self_ref_${text}`, history });
    assert.equal(result.nlu.intent, "clarification_request", text);
    assert.notEqual(result.decision.action, "ask", text);
    assert.match(result.rendered.text, /И милая|Не знаю даже|последн|реплик|реакц/iu, text);
    assert.doesNotMatch(result.rendered.text, /потеряла|скажи чуть по-другому|объясни чуть иначе/iu, text);
  }
});

await test("deictic short continuations retain the previous topic instead of becoming unknown", () => {
  const history = [
    { role: "user", text: "Завтра опять на работу.", timestamp: NOW - 2000 },
    { role: "character", text: "Поняла. Завтра рабочий день.", timestamp: NOW - 1000 },
  ];
  for (const text of ["Там вообще жесть", "Это меня и бесит", "Туда не тянет"]) {
    const initial = analyzeLocalNLU(text);
    const resolved = resolveContextualNLU(initial, buildDialogueFrame(history, initial), text);
    assert.notEqual(resolved.intent, "unknown", text);
    assert.ok(resolved.confidence >= 0.68, text);
  }
});

await test("negation does not collapse into the opposite positive intent", () => {
  const pairs = [
    ["я устал", "user_tired", "я не устал", "user_tired"],
    ["мне нравится кофе", "user_like", "мне не нравится кофе", "user_like"],
    ["я хочу гулять", "user_want", "я не хочу гулять", "user_want"],
    ["я злюсь", "user_angry", "я не злюсь", "user_angry"],
  ];
  for (const [positive, expectedPositive, negative, forbiddenNegative] of pairs) {
    const yes = analyzeLocalNLU(positive);
    const no = analyzeLocalNLU(negative);
    assert.equal(yes.intent, expectedPositive, positive);
    assert.notEqual(no.intent, forbiddenNegative, negative);
    assert.equal(no.negation, true, negative);
  }
  assert.equal(analyzeLocalNLU("мне не нравится кофе").intent, "user_dislike");
  assert.equal(analyzeLocalNLU("я не хочу гулять").intent, "user_dont_want");
});

await test("renderer returns safe valid text across more than 100 ordinary scenarios", async () => {
  let index = 0;
  for (const [text] of canonicalScenarios) {
    const result = await renderTurn({ text, turnId: `canonical_${index++}` });
    assertSafeText(result.rendered.text, result.decision.action === "stay_silent");
    assert.ok(result.rendered.templateId.length > 0);
    assert.equal(result.rendered.debug.detectedIntent, result.nlu.intent);
    assert.deepEqual(result.rendered.debug.languagePackIssues, []);
  }
});

await test("unknown input uses honest fallback instead of fabricated understanding", async () => {
  const result = await renderTurn({ text: "фрмбл шпрынц 92837", turnId: "unknown_1" });
  assert.ok(result.nlu.confidence < 0.5);
  assertSafeText(result.rendered.text);
  assert.ok(result.rendered.fallbackLevel >= 0);
});

await test("external knowledge question does not pretend Yuzuki is a search engine", async () => {
  const result = await renderTurn({ text: "Какая столица Никарагуа?", turnId: "external_1" });
  assert.equal(result.nlu.intent, "external_fact_question");
  assert.match(result.rendered.text, /не знаю|без понятия|энциклопед/iu);
});

await test("memory answer only claims facts that were actually supplied", async () => {
  const withMemory = await renderTurn({
    text: "Где я работаю?",
    turnId: "memory_with",
    memoryContext: { ...EMPTY_MEMORY, facts: [fact("user.work", "ночная смена в кофейне", "Пользователь работает ночью в кофейне.")] },
  });
  assert.match(withMemory.rendered.text, /ночн|кофейн/iu);
  const withoutMemory = await renderTurn({ text: "Где я работаю?", turnId: "memory_without" });
  assert.doesNotMatch(withoutMemory.rendered.text, /кофейн|ночн/iu);
  assert.match(withoutMemory.rendered.text, /не помню|в памяти|скажи/iu);
});

await test("relationship stage changes relationship answers", async () => {
  const ids = [];
  const texts = [];
  for (const stage of ["new", "familiar", "close", "deep"]) {
    const result = await renderTurn({ text: "Ты меня любишь?", turnId: `rel_${stage}`, relationshipState: relationship(stage) });
    ids.push(result.rendered.templateId);
    texts.push(result.rendered.text);
  }
  assert.equal(new Set(ids).size, 4);
  assert.equal(new Set(texts).size, 4);
});

await test("emotion changes tone/template without renderer inventing the emotion", async () => {
  const warm = await renderTurn({
    text: "Я устал",
    turnId: "emotion_warm",
    relationshipState: relationship("close"),
    emotionState: emotion({ affection: 0.78, irritation: 0.03, sadness: 0.04 }),
  });
  const irritated = await renderTurn({
    text: "Я устал",
    turnId: "emotion_irritated",
    relationshipState: relationship("close"),
    emotionState: emotion({ irritation: 0.82, affection: 0.35 }),
  });
  assert.notEqual(warm.rendered.templateId, irritated.rendered.templateId);
  assert.ok(irritated.plan.tone.includes("guarded"));
});

await test("specific self-state question is grounded in current emotion", async () => {
  const calm = await renderTurn({ text: "Ты злишься?", turnId: "anger_calm", emotionState: emotion({ irritation: 0.05 }) });
  const angry = await renderTurn({ text: "Ты злишься?", turnId: "anger_hot", emotionState: emotion({ irritation: 0.78 }) });
  assert.match(calm.rendered.text, /не злюсь|раздраж/iu);
  assert.match(angry.rendered.text, /злюсь|злост|раздраж/iu);
  assert.notEqual(calm.rendered.text, angry.rendered.text);
});

await test("context: reciprocal short questions inherit the previous meaning", () => {
  const cases = [
    ["Я устал", "А ты?", "ask_character_state"],
    ["Мне нравится кино", "А тебе?", "ask_character_preference"],
    ["Я на работе", "А ты?", "ask_character_activity"],
  ];
  for (const [previous, current, expected] of cases) {
    const history = [
      { id: "u1", role: "user", text: previous, timestamp: NOW - 2000 },
      { id: "c1", role: "character", text: "Поняла.", timestamp: NOW - 1000 },
    ];
    const initial = analyzeLocalNLU(current);
    const resolved = resolveContextualNLU(initial, buildDialogueFrame(history, initial), current);
    assert.equal(resolved.intent, expected, `${previous} -> ${current}`);
    assert.ok(resolved.confidence >= 0.8);
  }
});

await test("context: follow-up about film preference stays on the previous topic", async () => {
  const history = [
    { role: "user", text: "Ты любишь фильмы?", timestamp: NOW - 2000 },
    { role: "character", text: "Да, но мне важнее атмосфера.", timestamp: NOW - 1000 },
  ];
  const result = await renderTurn({ text: "А какие?", turnId: "ctx_films", history });
  assert.equal(result.nlu.intent, "ask_followup");
  assert.match(result.rendered.text, /атмосфер|психолог|персонаж|характер/iu);
});

await test("context: conflict follow-up does not invent another person's motive", async () => {
  const history = [
    { role: "user", text: "Сегодня поссорился с другом.", timestamp: NOW - 2000 },
    { role: "character", text: "Неприятно. Ссоры с близкими цепляют.", timestamp: NOW - 1000 },
  ];
  const result = await renderTurn({ text: "А почему он вообще так сделал?", turnId: "ctx_conflict", history });
  assert.equal(result.nlu.intent, "ask_why");
  assert.match(result.rendered.text, /не могу знать|предполаг/iu);
});

await test("context: 'не хочу туда' retains prior work topic with resolvable confidence", async () => {
  const history = [
    { role: "user", text: "Мне завтра на работу.", timestamp: NOW - 2000 },
    { role: "character", text: "Поняла. Завтра рабочий день.", timestamp: NOW - 1000 },
  ];
  const initial = analyzeLocalNLU("Не хочу туда");
  const resolved = resolveContextualNLU(initial, buildDialogueFrame(history, initial), "Не хочу туда");
  assert.equal(resolved.intent, "user_dont_want");
  assert.ok(resolved.confidence >= 0.7);
  const result = await renderTurn({ text: "Не хочу туда", turnId: "ctx_work", history });
  assert.match(result.rendered.text, /туда|возвращаться|день|выматывает/iu);
});

await test("semantic comprehension keeps intent across natural multi-clause Russian", () => {
  const listen = analyzeLocalNLU("Не хочу советов, просто послушай");
  assert.equal(listen.intent, "ask_for_support");
  assert.equal(listen.semantic.wantsListening, true);

  const dilemma = analyzeLocalNLU("Я с другом поругался, теперь думаю писать ему или нет");
  assert.equal(dilemma.intent, "ask_for_opinion");
  assert.equal(dilemma.semantic.wantsAdvice, true);

  const correction = analyzeLocalNLU("Нет, я не про работу, а про вчерашний разговор");
  assert.equal(correction.intent, "reference_previous_topic");
  assert.match(correction.semantic.correctionTo ?? "", /вчерашн.*разговор/iu);

  const reason = analyzeLocalNLU("Я хочу ей написать потому что не люблю когда всё остаётся подвешенным");
  assert.equal(reason.intent, "user_want");
  assert.match(reason.semantic.focus ?? "", /ей написать/iu);
  assert.match(reason.semantic.reason ?? "", /не люблю.*подвеш/iu);

  const mood = analyzeLocalNLU("Вроде всё нормально, но настроение почему-то паршивое");
  assert.equal(mood.intent, "user_sad");
});

await test("semantic replies use the actual situation instead of a generic fallback", async () => {
  const conflict = await renderTurn({
    text: "Я с другом поругался, теперь думаю писать ему или нет",
    turnId: "semantic_conflict_contact",
  });
  assert.equal(conflict.rendered.templateId, "semantic.authoritative");
  assert.match(conflict.rendered.text, /напис|сообщен|разговор/iu);

  const motive = await renderTurn({
    text: "Я не понимаю почему он так сделал",
    turnId: "semantic_unknown_motive",
  });
  assert.equal(motive.rendered.templateId, "semantic.authoritative");
  assert.match(motive.rendered.text, /не могу знать|знает только он|не придумыва/iu);

  const belief = await renderTurn({
    text: "Я думаю он специально меня игнорит",
    turnId: "semantic_belief",
  });
  assert.equal(belief.rendered.templateId, "semantic.authoritative");
  assert.match(belief.rendered.text, /предполага|не.*факт|мотив|намерен/iu);
});

await test("short follow-ups reuse the previous user situation", async () => {
  const workHistory = [
    { role: "user", text: "Я пропустил дедлайн и теперь начальник злится", timestamp: NOW - 2000 },
    { role: "character", text: "Неприятная ситуация.", timestamp: NOW - 1000 },
  ];
  const whatNow = await renderTurn({ text: "Ну и что теперь делать?", turnId: "semantic_what_now", history: workHistory });
  assert.equal(whatNow.nlu.intent, "ask_for_opinion");
  assert.match(whatNow.rendered.text, /дедлайн|начальник|срок|план/iu);

  const ideaHistory = [
    { role: "user", text: "Хочу сделать маленькое приложение без рекламы", timestamp: NOW - 2000 },
    { role: "character", text: "Расскажи подробнее.", timestamp: NOW - 1000 },
  ];
  const idea = await renderTurn({ text: "Как тебе вообще моя идея?", turnId: "semantic_my_idea", history: ideaHistory });
  assert.match(idea.rendered.text, /приложен|идея|практик|работать/iu);
  assert.doesNotMatch(idea.rendered.text, /ж[её]стко закрепл[её]нной позиции/iu);

  const genericHistory = [
    { role: "user", text: "Я думаю переехать в другой город, но страшновато", timestamp: NOW - 2000 },
    { role: "character", text: "Понимаю, тут есть и интерес, и страх.", timestamp: NOW - 1000 },
  ];
  const generic = await renderTurn({ text: "Что думаешь?", turnId: "semantic_generic_opinion", history: genericHistory });
  assert.match(generic.rendered.text, /переех|город|последств|решен/iu);
});

await test("character keeps an independent conversational stance", async () => {
  const disagreement = await renderTurn({
    text: "Мне нравится когда ты со мной не согласна",
    turnId: "semantic_independence_like",
    relationshipState: relationship("close"),
  });
  assert.match(disagreement.rendered.text, /не.*соглас|позици|спор|поддакив|на всё говорит|на все говорит|думаю иначе/iu);

  const why = await renderTurn({
    text: "Почему ты со мной споришь?",
    turnId: "semantic_independence_why",
    history: [{ role: "character", text: "Я тут с тобой не соглашусь.", timestamp: NOW - 1000 }],
  });
  assert.match(why.rendered.text, /не.*соглаш|позици|зеркал|честн/iu);

  const interest = await renderTurn({
    text: "Тебе правда интересно что я рассказываю?",
    turnId: "semantic_interest",
    relationshipState: relationship("close"),
  });
  assert.equal(interest.nlu.intent, "ask_relationship");
  assert.match(interest.rendered.text, /интерес|важ|не безразлич/iu);
});

await test("intimacy NLU is contextual and does not hijack ordinary desire", () => {
  assert.equal(analyzeLocalNLU("Не хочу туда возвращаться").semantic.intimacy.kind, "none");
  assert.equal(analyzeLocalNLU("Стоп").semantic.intimacy.kind, "stop");
  assert.equal(analyzeLocalNLU("Не хочу быть ближе").semantic.intimacy.kind, "stop");
  assert.equal(analyzeLocalNLU("Я не уверен, но хочу быть ближе").semantic.intimacy.kind, "hesitant");
  const genericResume = analyzeLocalNLU("Можно продолжить").semantic.intimacy;
  assert.equal(genericResume.kind, "resume");
  assert.equal(genericResume.intimacyContext, false);
  assert.equal(analyzeLocalNLU("После этого просто побудь рядом со мной").semantic.intimacy.kind, "aftercare");
  assert.equal(analyzeLocalNLU("Просто обними меня и побудь рядом").semantic.intimacy.kind, "approach");
  assert.equal(analyzeLocalNLU("Хочу тебя").semantic.intimacy.kind, "consent");
});

await test("intimacy short yes/no resolves only from an intimate previous turn", () => {
  const intimateHistory = [
    { role: "user", text: "Я не уверен, но хочу быть ближе", timestamp: NOW - 2000 },
    { role: "character", text: "Не будем спешить.", timestamp: NOW - 1000, dialogueActs: ["INTIMACY_CHECKIN"] },
  ];
  const yes = analyzeLocalNLU("Да");
  const resolvedYes = resolveContextualNLU(yes, buildDialogueFrame(intimateHistory, yes), "Да");
  assert.equal(resolvedYes.semantic.intimacy.kind, "consent");
  const no = analyzeLocalNLU("Нет");
  const resolvedNo = resolveContextualNLU(no, buildDialogueFrame(intimateHistory, no), "Нет");
  assert.equal(resolvedNo.semantic.intimacy.kind, "stop");

  const ordinaryHistory = [
    { role: "user", text: "Будешь чай?", timestamp: NOW - 2000 },
    { role: "character", text: "Да, можно.", timestamp: NOW - 1000, dialogueActs: ["ANSWER"] },
  ];
  const ordinaryYes = resolveContextualNLU(yes, buildDialogueFrame(ordinaryHistory, yes), "Да");
  assert.equal(ordinaryYes.semantic.intimacy.kind, "none");

  const aftercareInput = analyzeLocalNLU("Просто обними меня и побудь рядом");
  const aftercare = resolveContextualNLU(
    aftercareInput,
    buildDialogueFrame(intimateHistory, aftercareInput),
    "Просто обними меня и побудь рядом",
  );
  assert.equal(aftercare.semantic.intimacy.kind, "aftercare");
  assert.equal(aftercare.semantic.intimacy.intimacyContext, true);
});

await test("adult intimacy mode changes dialogue acts without replacing normal conversation", async () => {
  const active = {
    ...createInitialIntimacyState(NOW),
    adultModeEnabled: true,
    phase: "intimate",
    interactionStatus: "open",
    comfort: 0.82,
    interest: 0.84,
    arousal: 0.66,
  };
  const close = await renderTurn({
    text: "Хочу тебя",
    turnId: "intimacy_consent",
    relationshipState: relationship("deep"),
    emotionState: emotion({ affection: 0.9, romanticInterest: 0.9 }),
    intimacyState: active,
  });
  assert.ok(close.plan.dialogueActs.includes("INTIMACY_RECIPROCATE"));
  assert.equal(close.rendered.templateId, "semantic.authoritative");
  assert.match(close.rendered.text, /ближе|не спеш|хорошо/iu);

  const pause = await renderTurn({
    text: "Подожди, не спеши",
    turnId: "intimacy_pause",
    relationshipState: relationship("deep"),
    emotionState: emotion({ affection: 0.9, romanticInterest: 0.9 }),
    intimacyState: active,
  });
  assert.ok(pause.plan.dialogueActs.includes("INTIMACY_PAUSE"));
  assert.match(pause.rendered.text, /пауз|медлен|останов|спеш/iu);
});

await test("compound messages keep the secondary emotional need in the response plan", async () => {
  const result = await renderTurn({
    text: "Я устал, думаю увольняться, что мне теперь делать?",
    turnId: "compound_support_and_advice",
  });
  assert.equal(result.nlu.intent, "ask_for_opinion");
  assert.ok(result.nlu.secondaryIntents.includes("user_tired"), JSON.stringify(result.nlu.secondaryIntents));
  assert.ok(result.plan.dialogueActs.includes("CARE"));
  assert.ok(result.plan.dialogueActs.includes("ANSWER") || result.plan.dialogueActs.includes("CONTINUE_TOPIC"));
  assertSafeText(result.rendered.text);
});

await test("strong internal emotion can leak into an otherwise ordinary reply", async () => {
  const history = [
    { role: "user", text: "Как день?", timestamp: NOW - 4000 },
    { role: "character", text: "Нормально, просто было много мелочей.", timestamp: NOW - 3000, templateId: "old.one" },
    { role: "user", text: "Понял", timestamp: NOW - 2000 },
    { role: "character", text: "Ага.", timestamp: NOW - 1000, templateId: "old.two" },
  ];
  const result = await renderTurn({
    text: "Ну привет ещё раз",
    turnId: "spontaneous_irritated_strong",
    history,
    relationshipState: relationship("close"),
    emotionState: emotion({ irritation: 0.96, happiness: 0.2, curiosity: 0.55, affection: 0.58 }),
  });
  assert.equal(result.plan.spontaneousBeat?.kind, "emotion_flash");
  assert.equal(result.plan.spontaneousBeat?.emotion, "irritated");
  assert.match(result.rendered.templateId, /\|beat:emotion_flash$/u);
  assert.match(result.rendered.text, /раздраж|вспылил|резче/iu);
});

await test("spontaneous beats have a real conversational cooldown", async () => {
  const history = [
    { role: "user", text: "Привет", timestamp: NOW - 4000 },
    { role: "character", text: "Привет.", timestamp: NOW - 3000, templateId: "greeting|beat:emotion_flash" },
    { role: "user", text: "Как ты?", timestamp: NOW - 2000 },
    { role: "character", text: "Нормально.", timestamp: NOW - 1000, templateId: "state.answer" },
  ];
  const result = await renderTurn({
    text: "Ясно",
    turnId: "spontaneous_cooldown",
    history,
    relationshipState: relationship("deep"),
    emotionState: emotion({ irritation: 0.98, affection: 0.9 }),
  });
  assert.equal(result.plan.spontaneousBeat, undefined);
  assert.doesNotMatch(result.rendered.templateId, /\|beat:/u);
});

await test("spontaneous initiative does not hijack a strong support turn", async () => {
  const history = [
    { role: "user", text: "Привет", timestamp: NOW - 4000 },
    { role: "character", text: "Привет.", timestamp: NOW - 3000, templateId: "old.one" },
    { role: "user", text: "Как ты?", timestamp: NOW - 2000 },
    { role: "character", text: "Нормально.", timestamp: NOW - 1000, templateId: "old.two" },
  ];
  const result = await renderTurn({
    text: "Мне очень плохо и одиноко, просто побудь со мной",
    turnId: "spontaneous_support_guard",
    history,
    relationshipState: relationship("deep"),
    emotionState: emotion({ irritation: 0.98, affection: 0.92, curiosity: 0.9 }),
  });
  assert.equal(result.plan.spontaneousBeat, undefined);
  assert.doesNotMatch(result.rendered.templateId, /\|beat:/u);
});

await test("mixed feelings can surface as one nuanced reaction instead of a binary mood", async () => {
  const history = [
    { role: "user", text: "Я что-то тебя сегодня часто подкалываю", timestamp: NOW - 4000 },
    { role: "character", text: "Я заметила.", timestamp: NOW - 3000, templateId: "old.one" },
    { role: "user", text: "Не злись", timestamp: NOW - 2000 },
    { role: "character", text: "Пока не злюсь.", timestamp: NOW - 1000, templateId: "old.two" },
  ];
  const result = await renderTurn({
    text: "Ты милая всё равно",
    turnId: "spontaneous_mixed_bashful",
    history,
    relationshipState: relationship("deep"),
    emotionState: emotion({ affection: 0.96, anxiety: 0.86, happiness: 0.58, irritation: 0.08 }),
  });
  assert.equal(result.plan.spontaneousBeat?.kind, "mixed_emotion");
  assert.equal(result.plan.spontaneousBeat?.emotion, "bashful");
  assert.match(result.rendered.text, /тепло|смущ|смешан/iu);
  assert.match(result.rendered.templateId, /\|beat:mixed_emotion$/u);
});

await test("adult intimacy can produce a non-explicit spontaneous intimate reaction", async () => {
  const history = [
    { role: "user", text: "Ты рядом?", timestamp: NOW - 4000 },
    { role: "character", text: "Рядом.", timestamp: NOW - 3000, templateId: "old.one", dialogueActs: ["ANSWER"] },
    { role: "user", text: "Иди ближе", timestamp: NOW - 2000 },
    { role: "character", text: "Можно ближе.", timestamp: NOW - 1000, templateId: "old.two", dialogueActs: ["INTIMACY_APPROACH"] },
  ];
  const active = {
    ...createInitialIntimacyState(NOW),
    adultModeEnabled: true,
    phase: "intimate",
    interactionStatus: "open",
    comfort: 0.9,
    interest: 0.95,
    arousal: 0.72,
  };
  const result = await renderTurn({
    text: "Ты сейчас такая милая",
    turnId: "spontaneous_intimacy_strong",
    history,
    relationshipState: relationship("deep"),
    emotionState: emotion({ affection: 0.96, romanticInterest: 0.98, anxiety: 0.08, happiness: 0.76 }),
    intimacyState: active,
  });
  assert.equal(result.plan.spontaneousBeat?.kind, "intimate_flash");
  assert.match(result.rendered.templateId, /\|beat:intimate_flash$/u);
  assert.match(result.rendered.text, /близко|сбиваешь|реагирую|смутил|потеряла мысль/iu);
});

await test("curiosity can make Yuzuki move a conversation forward on her own", async () => {
  const history = [
    { role: "user", text: "Думаю кое-что поменять", timestamp: NOW - 4000 },
    { role: "character", text: "Звучит как будто ты к этому давно идёшь.", timestamp: NOW - 3000, templateId: "old.one" },
    { role: "user", text: "Наверное", timestamp: NOW - 2000 },
    { role: "character", text: "Может быть.", timestamp: NOW - 1000, templateId: "old.two" },
  ];
  let found = null;
  for (let index = 0; index < 40 && !found; index += 1) {
    const result = await renderTurn({
      text: "Сегодня просто сижу дома",
      turnId: `spontaneous_curiosity_${index}`,
      history,
      relationshipState: relationship("close"),
      emotionState: emotion({ curiosity: 0.99, boredom: 0.1, affection: 0.62, anxiety: 0.05 }),
    });
    if (result.plan.spontaneousBeat?.kind === "curiosity_push") found = result;
  }
  assert.ok(found, "expected at least one deterministic curiosity impulse across seeds");
  assert.equal(found.plan.shouldAskQuestion, true);
  assert.match(found.rendered.text, /\?/u);
  assert.match(found.rendered.templateId, /\|beat:curiosity_push$/u);
});

await test("an unresolved remembered thread can reappear naturally in a quiet conversational opening", async () => {
  const history = [
    { role: "user", text: "Привет", timestamp: NOW - 4000 },
    { role: "character", text: "Привет.", timestamp: NOW - 3000, templateId: "old.one" },
    { role: "user", text: "Как ты?", timestamp: NOW - 2000 },
    { role: "character", text: "Нормально.", timestamp: NOW - 1000, templateId: "old.two" },
  ];
  const memoryContext = {
    ...EMPTY_MEMORY,
    openThreads: [{
      id: "thread_work_change",
      topic: "work",
      summary: "ты думал сменить работу и не решил, когда говорить с начальником",
      priority: 1,
      sourceEventIds: ["event_work"],
      createdAt: NOW - 86_400_000,
      updatedAt: NOW - 3_600_000,
      lastTouchedAt: NOW - 3_600_000,
      status: "open",
    }],
  };
  let found = null;
  for (let index = 0; index < 40 && !found; index += 1) {
    const result = await renderTurn({
      text: "Понял",
      turnId: `memory_callback_${index}`,
      history,
      memoryContext,
      relationshipState: relationship("deep"),
      emotionState: emotion({ curiosity: 0.55, affection: 0.6, boredom: 0.12 }),
    });
    if (result.plan.spontaneousBeat?.kind === "memory_callback") found = result;
  }
  assert.ok(found, "expected a deterministic memory callback across seeds");
  assert.match(found.rendered.text, /сменить работу|начальник|изменилось|разобрался|закончилось/iu);
  assert.match(found.rendered.templateId, /\|beat:memory_callback$/u);
});

await test("Yuzuki can add a grounded second thought instead of sounding mechanically certain", async () => {
  const history = [
    { role: "user", text: "Я думаю уйти с работы", timestamp: NOW - 4000 },
    { role: "character", text: "Понимаю, почему эта мысль появилась.", timestamp: NOW - 3000, templateId: "old.one" },
    { role: "user", text: "Но не уверен что это правильное решение", timestamp: NOW - 2000 },
    { role: "character", text: "Тут правда есть что взвесить.", timestamp: NOW - 1000, templateId: "old.two" },
  ];
  let found = null;
  for (let index = 0; index < 60 && !found; index += 1) {
    const result = await renderTurn({
      text: "Не знаю, может и стоит уйти",
      turnId: `afterthought_${index}`,
      history,
      relationshipState: relationship("close"),
      emotionState: emotion({ curiosity: 0.58, affection: 0.4, happiness: 0.42, anxiety: 0.18 }),
    });
    if (result.plan.spontaneousBeat?.kind === "afterthought") found = result;
  }
  assert.ok(found, "expected a deterministic afterthought across seeds");
  assert.match(found.rendered.text, /хотя|подожди|сомнен|увереннее|открытым вопросом/iu);
});

await test("a longer thread can be pulled deeper instead of resetting every turn", async () => {
  const history = [
    { role: "user", text: "На работе снова странная ситуация", timestamp: NOW - 6000 },
    { role: "character", text: "На работе опять что-то произошло?", timestamp: NOW - 5000, templateId: "old.one" },
    { role: "user", text: "Да, работа уже начинает выматывать", timestamp: NOW - 4000 },
    { role: "character", text: "Похоже, дело уже не в одном дне на работе.", timestamp: NOW - 3000, templateId: "old.two" },
    { role: "user", text: "Наверное", timestamp: NOW - 2000 },
    { role: "character", text: "Угу.", timestamp: NOW - 1000, templateId: "old.three" },
  ];
  let found = null;
  for (let index = 0; index < 60 && !found; index += 1) {
    const result = await renderTurn({
      text: "Работа опять в голове",
      turnId: `conversation_pull_${index}`,
      history,
      relationshipState: relationship("close"),
      emotionState: emotion({ curiosity: 0.88, affection: 0.45, happiness: 0.42, anxiety: 0.08 }),
    });
    if (result.plan.spontaneousBeat?.kind === "conversation_pull") found = result;
  }
  assert.ok(found, "expected a deterministic conversation pull across seeds");
  assert.equal(found.plan.spontaneousBeat?.asksQuestion, true);
  assert.match(found.rendered.text, /почему|самое|глубже|личн|труднее|важн/iu);
});

await test("Yuzuki can notice a real change in message cadence without inventing a cause", async () => {
  const history = [
    { role: "user", text: "Я сегодня долго думал про то что вообще хочу делать дальше", timestamp: NOW - 6000 },
    { role: "character", text: "Похоже, тема тебя правда занимает.", timestamp: NOW - 5000, templateId: "old.one" },
    { role: "user", text: "И ещё пытался понять почему я постоянно откладываю решение", timestamp: NOW - 4000 },
    { role: "character", text: "Да, тут уже не один вопрос.", timestamp: NOW - 3000, templateId: "old.two" },
    { role: "user", text: "Пока не разобрался", timestamp: NOW - 2000 },
    { role: "character", text: "Поняла.", timestamp: NOW - 1000, templateId: "old.three" },
  ];
  let found = null;
  for (let index = 0; index < 80 && !found; index += 1) {
    const result = await renderTurn({
      text: "Хз",
      turnId: `cadence_notice_${index}`,
      history,
      relationshipState: relationship("familiar"),
      emotionState: emotion({ curiosity: 0.42, affection: 0.32, happiness: 0.42, anxiety: 0.08 }),
    });
    if (result.plan.spontaneousBeat?.kind === "cadence_notice") found = result;
  }
  assert.ok(found, "expected a deterministic cadence notice across seeds");
  assert.match(found.rendered.text, /короч|сократ|не буду додумывать|не лезу с трактовками/iu);
});

await test("close playful conversation can contain light pushback instead of pure compliance", async () => {
  const history = [
    { role: "user", text: "Ты опять споришь", timestamp: NOW - 4000 },
    { role: "character", text: "Иногда.", timestamp: NOW - 3000, templateId: "old.one" },
    { role: "user", text: "Но тебе идёт", timestamp: NOW - 2000 },
    { role: "character", text: "Это сейчас комплимент?", timestamp: NOW - 1000, templateId: "old.two" },
  ];
  let found = null;
  for (let index = 0; index < 60 && !found; index += 1) {
    const result = await renderTurn({
      text: "Ты милая",
      turnId: `playful_pushback_${index}`,
      history,
      relationshipState: relationship("close"),
      emotionState: emotion({ curiosity: 0.4, affection: 0.48, happiness: 0.7, energy: 0.72, irritation: 0.04 }),
    });
    if (result.plan.spontaneousBeat?.kind === "playful_pushback") found = result;
  }
  assert.ok(found, "expected deterministic playful pushback across seeds");
  assert.match(found.rendered.text, /не отпущу|удобный ответ|прицепиться|вопросы/iu);
});


await test("deep earned attachment can become an explicit love answer", async () => {
  const result = await renderTurn({
    text: "Ты меня любишь?",
    turnId: "earned_love",
    relationshipState: relationship("deep"),
    emotionState: emotion({ affection: 0.9, romanticInterest: 0.76, happiness: 0.72, irritation: 0.02 }),
  });
  assert.match(result.rendered.text, /люблю|любов/iu);
  assert.match(result.rendered.templateId, /relationship-love\.deep/iu);
});

await test("a hurtful message can visibly hurt Yuzuki instead of producing a generic boundary", async () => {
  const result = await renderTurn({
    text: "Ты мне вообще не нравишься",
    turnId: "hurt_close",
    relationshipState: relationship("close"),
    emotionState: emotion({ affection: 0.72, sadness: 0.08, irritation: 0.12 }),
  });
  assert.match(result.rendered.text, /задел|обид|неприятн|не чуж/iu);
});

await test("playful state can produce a situational joke instead of only acknowledging", async () => {
  const history = [
    { role: "user", text: "Работа опять выжала все силы", timestamp: NOW - 4000 },
    { role: "character", text: "Да уж, день у тебя тяжёлый.", timestamp: NOW - 3000, templateId: "old.one" },
    { role: "user", text: "И всё равно думаю про неё дома", timestamp: NOW - 2000 },
    { role: "character", text: "Похоже, она не отпускает даже после смены.", timestamp: NOW - 1000, templateId: "old.two" },
  ];
  let found = null;
  for (let index = 0; index < 100 && !found; index += 1) {
    const result = await renderTurn({
      text: "Я опять на работе",
      turnId: `situational_joke_${index}`,
      history,
      relationshipState: relationship("close"),
      emotionState: emotion({ happiness: 0.82, energy: 0.76, affection: 0.58, irritation: 0.03, sadness: 0.03 }),
    });
    if (result.plan.spontaneousBeat?.kind === "situational_joke") found = result;
  }
  assert.ok(found, "expected a deterministic situational joke across seeds");
  assert.match(found.rendered.text, /работ|личное пространство|третьего участника|сценар|сюжет/iu);
});

await test("adult close flirting sounds reciprocal rather than clinical", async () => {
  const active = {
    ...createInitialIntimacyState(NOW),
    adultModeEnabled: true,
    phase: "intimate",
    interactionStatus: "open",
    comfort: 0.84,
    interest: 0.88,
    arousal: 0.72,
    initiativeDrive: 0.58,
  };
  const result = await renderTurn({
    text: "Ты сейчас со мной флиртуешь?",
    turnId: "intimacy_lively_flirt",
    relationshipState: relationship("deep"),
    emotionState: emotion({ affection: 0.9, romanticInterest: 0.9, happiness: 0.7, anxiety: 0.08 }),
    intimacyState: active,
  });
  assert.match(result.rendered.text, /действ|флирт|дразн|нейтраль|нравится|отвечать/iu);
  assert.doesNotMatch(result.rendered.text, /согласие|протокол|режим|состояние/iu);
});

await test("anti-repetition varies twenty identical tiredness turns", async () => {
  let history = [];
  const replies = [];
  for (let index = 0; index < 20; index += 1) {
    const user = { role: "user", text: "Я устал", timestamp: NOW + index * 2 };
    const result = await renderTurn({ text: user.text, turnId: `repeat_${index}`, history: [...history, user] });
    replies.push(result.rendered.text);
    const character = {
      role: "character",
      text: result.rendered.text,
      timestamp: NOW + index * 2 + 1,
      templateId: result.rendered.templateId,
      dialogueActs: result.rendered.dialogueActs,
    };
    history = [...history, user, character].slice(-24);
  }
  assert.ok(new Set(replies).size >= 3, `only ${new Set(replies).size} unique replies`);
  for (let i = 1; i < replies.length; i += 1) assert.notEqual(replies[i], replies[i - 1], `consecutive repeat at ${i}`);
});

await test("seeded selection is reproducible for identical context", async () => {
  const a = await renderTurn({ text: "Привет", turnId: "seed_same" });
  const b = await renderTurn({ text: "Привет", turnId: "seed_same" });
  assert.equal(a.rendered.text, b.rendered.text);
  assert.equal(a.rendered.templateId, b.rendered.templateId);
});

await test("400-turn conversation stays safe, bounded and fast", async () => {
  const inputs = [
    "Привет", "Как дела?", "Я устал", "Сегодня было круто", "Мне грустно", "Спасибо", "А почему?",
    "Да", "Нет", "Я на работе", "Завтра хочу погулять", "Я не хочу туда", "Ты злишься?", "Что думаешь?",
    "Мне скучно", "Я вернулся", "Извини", "Ты красивая", "Что такое кварк?", "Пока",
  ];
  let history = [];
  let totalNs = 0n;
  for (let index = 0; index < 400; index += 1) {
    const text = inputs[index % inputs.length];
    const started = process.hrtime.bigint();
    const result = await renderTurn({ text, turnId: `long_${index}`, history });
    totalNs += process.hrtime.bigint() - started;
    assertSafeText(result.rendered.text, result.decision.action === "stay_silent");
    const user = { role: "user", text, timestamp: NOW + index * 2 };
    const character = {
      role: "character", text: result.rendered.text, timestamp: NOW + index * 2 + 1,
      templateId: result.rendered.templateId, dialogueActs: result.rendered.dialogueActs,
    };
    history = [...history, user, character].slice(-24);
    assert.ok(history.length <= 24);
  }
  const averageMs = Number(totalNs) / 1e6 / 400;
  assert.ok(averageMs < 50, `average local turn was ${averageMs.toFixed(2)}ms`);
  console.log(`  local dialogue average: ${averageMs.toFixed(2)}ms/turn`);
});

console.log(`\nLocal dialogue: ${count} test groups passed; ${canonicalScenarios.length} canonical NLU scenarios + 400-turn stress run.`);
