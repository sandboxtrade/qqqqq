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
  detectLocalAppearanceRequest,
  buildDialogueContext,
  buildDialogueFrame,
  buildCausalRelations,
  buildRetrospectiveContext,
  applyRetrospectiveNLU,
  extractCausalRelations,
  shouldUseRetrospectivePass,
  localDialogueRenderer,
  planLocalDialogue,
  resolveContextualNLU,
} = await import("../src/local-dialogue/index.ts");
const { russianLanguagePack } = await import("../src/local-dialogue/language-pack.ts");
const { localPerception, interpret, buildThought, decide, planResponse } = await import("../src/cognition/local-cognition.ts");
const { defaultCharacter } = await import("../src/character/character.ts");
const { initialEmotionalState, deriveMood } = await import("../src/emotions/emotions.ts");
const { initialRelationshipState } = await import("../src/relationship/relationship.ts");
const { createInitialWorldState } = await import("../src/world/world.ts");
const { createInitialIntimacyState, createInitialIntimacyPreferences, ensureCoreIntimacyPreferences, buildIntimacyMind } = await import("../src/intimacy/intimacy.ts");
const { encodeCharacterViewValue, characterViewTopicKey } = await import("../src/memory/model.ts");

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

function characterOpinionFact(topic, position = "positive", reason = "experience", evidenceCount = 2) {
  const topicKey = characterViewTopicKey(topic);
  return {
    id: `fact_character_${topicKey}_${position}`,
    subject: "character",
    key: `character.opinion.${topicKey}`,
    statement: `Yuzuki has a ${position} view on ${topic}.`,
    value: encodeCharacterViewValue({ topic, position, reason }),
    confidence: 0.72,
    evidenceCount,
    sourceEventIds: ["character_event_1"],
    sourceMemoryIds: ["memory_character_event_1"],
    createdAt: NOW - 4000,
    updatedAt: NOW - 1000,
    lastConfirmedAt: NOW - 1000,
    validFrom: NOW - 4000,
    status: "active",
  };
}

function characterTensionFact(topic, direction = "negative", evidenceCount = 1) {
  const topicKey = characterViewTopicKey(topic);
  return {
    id: `fact_character_tension_${topicKey}_${direction}`,
    subject: "character",
    key: `character.tension.${topicKey}`,
    statement: `Yuzuki has a live counterargument on ${topic}.`,
    value: `challenge|${direction}`,
    confidence: 0.6,
    evidenceCount,
    sourceEventIds: ["character_event_tension"],
    sourceMemoryIds: ["memory_character_event_tension"],
    createdAt: NOW - 3000,
    updatedAt: NOW - 800,
    lastConfirmedAt: NOW - 800,
    validFrom: NOW - 3000,
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
  intimacyMind = undefined,
  intimacyPreferences = undefined,
  retrospective = undefined,
  causalRelations = undefined,
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
  const previousNlu = frame.previousUserText ? analyzeLocalNLU(frame.previousUserText) : undefined;
  const counterArgumentCue = nlu.isQuestion && /(?:разве|но\s+ведь|с\s+другой\s+стороны|а\s+если)/iu.test(text);
  const continuityFocus = nlu.semantic.focus ?? (
    ["ask_followup", "reference_previous_topic", "ask_character_opinion", "ask_character_preference", "ask_why"].includes(nlu.intent) || counterArgumentCue
      ? previousNlu?.semantic.focus
      : undefined
  );
  const thought = buildThought(defaultCharacter, perception, interpretation, emotionState, relationshipState, memoryContext, {
    userText: text,
    topic: nlu.topic ?? frame.previousTopic,
    focus: continuityFocus,
    semanticStance: nlu.semantic.stance,
    reason: nlu.semantic.reason,
    sentiment: nlu.sentiment,
    asksCharacterView: nlu.semantic.asksCharacterView || ["ask_character_opinion", "ask_character_preference", "ask_for_opinion"].includes(nlu.intent),
    negation: nlu.negation,
    meaningfulTokens: nlu.semantic.meaningfulTokens,
    previousUserText: frame.previousUserText,
    intimacyMind,
    causalCause: causalRelations?.[0]?.cause,
    causalEffect: causalRelations?.[0]?.effect,
    causalRelation: causalRelations?.[0]?.kind,
    causalConfidence: causalRelations?.[0]?.confidence,
    retrospectiveEcho: retrospective?.summary,
    retrospectiveRecovered: retrospective?.recovered === true,
  });
  const decision = decide(defaultCharacter, perception, interpretation, emotionState, relationshipState, world, thought);
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
    intimacyMind,
    intimacyPreferences,
    memoryContext,
    history,
    nlu,
    perception,
    thought,
    decision,
    responsePlan,
    retrospective,
    causalRelations,
  });
  const plan = planLocalDialogue(context);
  const rendered = await localDialogueRenderer.render(plan, context);
  return { nlu, perception, thought, decision, responsePlan, context, plan, rendered };
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

await test("direct pose requests are recognized without turning the visual layer into a command", () => {
  for (const text of [
    "смени позу",
    "покажи другую позу",
    "сядь по-другому",
    "можешь встать немного иначе?",
  ]) {
    const request = detectLocalAppearanceRequest(text);
    const nlu = analyzeLocalNLU(text);
    assert.equal(request.requested, true, text);
    assert.equal(request.suggestive, false, text);
    assert.equal(nlu.intent, "request_action", text);
    assert.ok(nlu.confidence >= 0.8, `${text}: confidence ${nlu.confidence}`);
  }

  for (const text of [
    "покажи более сексуальную позу",
    "можешь принять пошлую позу?",
  ]) {
    const request = detectLocalAppearanceRequest(text);
    const nlu = analyzeLocalNLU(text);
    assert.equal(request.requested, true, text);
    assert.equal(request.suggestive, true, text);
    assert.equal(request.vibe, "seductive", text);
    assert.equal(nlu.intent, "request_action", text);
    assert.equal(nlu.semantic.intimacy.kind, "flirt", text);
    assert.equal(nlu.semantic.intimacy.intimacyContext, true, text);
  }
});

await test("short tomorrow-plan questions are understood as requests for ideas", async () => {
  const cases = [
    "какие на завтра идеи",
    "какие идеи на завтра",
    "есть идеи на завтра?",
    "что по планам на завтра?",
  ];
  const history = [
    { role: "user", text: "Как у тебя сегодня настроение?", timestamp: NOW - 2000 },
    { role: "character", text: "В целом всё нормально, я спокойная.", timestamp: NOW - 1000 },
  ];
  for (const text of cases) {
    const result = await renderTurn({ text, turnId: `tomorrow_${text}`, history });
    assert.equal(result.nlu.intent, "ask_for_opinion", text);
    assert.equal(result.nlu.topic, "plans", text);
    assert.notEqual(result.decision.action, "ask", text);
    assert.doesNotMatch(result.rendered.text, /перефраз|не поймала связку|не совсем поняла|скажи чуть иначе/iu, text);
    assert.match(result.rendered.text, /завтра|фильм|игр|вечер|план/iu, text);
  }
});

await test("short certainty follow-ups stay anchored to Yuzuki's immediately previous reply", async () => {
  const history = [
    { role: "user", text: "Ты злая", timestamp: NOW - 2000 },
    { role: "character", text: "Нет, я сейчас не злюсь.", timestamp: NOW - 1000, dialogueActs: ["ANSWER"] },
  ];
  for (const text of ["Точно?", "Правда?", "Серьезно?", "Реально?", "Ты уверена?"]) {
    const result = await renderTurn({ text, turnId: `certainty_${text}`, history });
    assert.equal(result.nlu.intent, "ask_followup", text);
    assert.equal(result.nlu.semantic.focus, "Нет, я сейчас не злюсь.", text);
    assert.equal(result.decision.action, "answer", text);
    assert.match(result.rendered.text, /злюсь|злост|злая|именно это/iu, text);
    assert.doesNotMatch(result.rendered.text, /ага,? поняла|мнение у меня|первого впечатления/iu, text);
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

await test("suggestive compliments are stronger flirt signals than ordinary appearance compliments", () => {
  const warmTurn = analyzeLocalNLU("Ты очень красивая");
  const warm = warmTurn.semantic.intimacy;
  assert.equal(warmTurn.intent, "compliment_character");
  assert.equal(warm.kind, "affection");
  assert.ok(warm.strength >= 0.6 && warm.strength < 0.8);

  const boldTurn = analyzeLocalNLU("Ты чертовски сексуальная");
  const bold = boldTurn.semantic.intimacy;
  assert.equal(boldTurn.intent, "flirt_character");
  assert.equal(bold.kind, "flirt");
  assert.ok(bold.strength >= 0.88);
  assert.equal(bold.intimacyContext, true);

  const figureTurn = analyzeLocalNLU("У тебя шикарная фигура");
  const figure = figureTurn.semantic.intimacy;
  assert.equal(figureTurn.intent, "flirt_character");
  assert.equal(figure.kind, "flirt");
  assert.ok(figure.strength >= 0.88);
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

await test("ordinary liking is not consent, while intimate continuity can make the same fresh cue meaningful", () => {
  const ordinary = analyzeLocalNLU("Мне это нравится");
  assert.equal(ordinary.semantic.intimacy.kind, "none");
  assert.equal(ordinary.semantic.intimacy.intimacyContext, false);

  const history = [
    { role: "user", text: "Можно ближе?", timestamp: NOW - 2000 },
    { role: "character", text: "Можно.", timestamp: NOW - 1000, dialogueActs: ["INTIMACY_APPROACH"] },
  ];
  const initial = analyzeLocalNLU("Мне это нравится");
  const contextual = resolveContextualNLU(initial, buildDialogueFrame(history, initial), "Мне это нравится");
  assert.equal(contextual.semantic.intimacy.kind, "consent");
  assert.equal(contextual.semantic.intimacy.intimacyContext, true);
});

await test("short doubt inside intimacy becomes hesitation instead of accidental escalation", () => {
  const history = [
    { role: "user", text: "Иди ближе", timestamp: NOW - 2000 },
    { role: "character", text: "Хорошо, но без спешки.", timestamp: NOW - 1000, dialogueActs: ["INTIMACY_APPROACH"] },
  ];
  const initial = analyzeLocalNLU("Не знаю...");
  const contextual = resolveContextualNLU(initial, buildDialogueFrame(history, initial), "Не знаю...");
  assert.equal(contextual.semantic.intimacy.kind, "hesitant");
  assert.equal(contextual.semantic.intimacy.explicit, true);
});

await test("adult self-questions are answered from Yuzuki's actual intimacy mind and forming preferences", async () => {
  const intimacyState = {
    ...createInitialIntimacyState(NOW), adultModeEnabled: true, phase: "intimate", interactionStatus: "open",
    comfort: 0.86, interest: 0.9, arousal: 0.7, initiativeDrive: 0.5,
  };
  const intimacyPreferences = ensureCoreIntimacyPreferences(createInitialIntimacyPreferences(NOW), NOW).document;
  const relationshipState = relationship("deep");
  const emotionState = emotion({ affection: 0.92, romanticInterest: 0.92, happiness: 0.72, energy: 0.7, anxiety: 0.06 });
  const world = createInitialWorldState(NOW, "Europe/Amsterdam");
  world.isAwake = true;
  world.availability = "free";
  world.currentLocation = "bedroom";
  const intimacyMind = buildIntimacyMind({
    state: intimacyState, preferences: intimacyPreferences,
    signal: { kind: "none", strength: 0, explicit: false, intimacyContext: true },
    emotion: emotionState, relationship: relationshipState, world,
  });
  const arousal = await renderTurn({
    text: "Ты сейчас возбуждена?", turnId: "intimacy_self_arousal",
    relationshipState, emotionState, intimacyState, intimacyMind, intimacyPreferences,
  });
  assert.match(arousal.rendered.text, /да|есть|тянет|напряж|нейтраль/iu);
  assert.doesNotMatch(arousal.rendered.text, /не знаю, что ответить|не поняла/iu);

  const preference = await renderTurn({
    text: "Тебе нравится флирт?", turnId: "intimacy_pref_forming",
    relationshipState, emotionState, intimacyState, intimacyMind, intimacyPreferences,
  });
  assert.match(preference.rendered.text, /не уверен|не хочу придумывать|нет честного устойчивого|теорию/iu);
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

await test("jealousy appears as an earned vulnerable feeling instead of default possessiveness", async () => {
  const deep = await renderTurn({
    text: "Я завтра иду на свидание с другой девушкой",
    turnId: "earned_jealousy_deep",
    relationshipState: relationship("deep"),
    emotionState: emotion({ affection: 0.92, romanticInterest: 0.84, happiness: 0.62, anxiety: 0.08, irritation: 0.03 }),
  });
  assert.ok((deep.thought.jealousy ?? 0) >= 0.34, JSON.stringify(deep.thought));
  assert.ok(deep.plan.dialogueActs.includes("JEALOUSY"), JSON.stringify(deep.plan.dialogueActs));
  assert.match(deep.rendered.text, /ревн|кольнул|важен|уязв|неприятн/iu);
  assert.match(deep.rendered.text, /не\s+(?:хочу\s+)?(?:контрол|запрещ|превращ)|не\s+право|не\s+собствен|мо[её]\s+чувств|требован|провер/iu);

  const familiar = await renderTurn({
    text: "Я завтра иду на свидание с другой девушкой",
    turnId: "earned_jealousy_familiar",
    relationshipState: relationship("familiar"),
    emotionState: emotion({ affection: 0.38, romanticInterest: 0.08, happiness: 0.55 }),
  });
  assert.ok((familiar.thought.jealousy ?? 0) < 0.34, JSON.stringify(familiar.thought));
  assert.ok(!familiar.plan.dialogueActs.includes("JEALOUSY"), JSON.stringify(familiar.plan.dialogueActs));
});

await test("love and hurt can coexist after conflict instead of one emotion erasing the other", async () => {
  const result = await renderTurn({
    text: "Ты меня любишь?",
    turnId: "love_while_hurt",
    relationshipState: {
      ...relationship("deep"),
      security: 0.62,
      unresolvedTension: 0.62,
    },
    emotionState: emotion({
      affection: 0.94,
      romanticInterest: 0.82,
      happiness: 0.42,
      sadness: 0.46,
      irritation: 0.18,
      anxiety: 0.22,
    }),
  });
  assert.ok((result.thought.love ?? 0) > 0.55, JSON.stringify(result.thought));
  assert.ok((result.thought.hurt ?? 0) >= 0.38, JSON.stringify(result.thought));
  assert.match(result.rendered.text, /люблю/iu);
  assert.match(result.rendered.text, /обид|задел|боль|не\s+(?:делать\s+вид|выключает|чинит)|время/iu);
});

await test("Yuzuki can report whether an old hurt is still present instead of resetting to fine", async () => {
  const result = await renderTurn({
    text: "Ты на меня обиделась?",
    turnId: "hurt_self_awareness",
    relationshipState: {
      ...relationship("deep"),
      security: 0.6,
      unresolvedTension: 0.58,
    },
    emotionState: emotion({ affection: 0.84, romanticInterest: 0.68, sadness: 0.42, irritation: 0.19, happiness: 0.38 }),
  });
  assert.ok((result.thought.hurt ?? 0) >= 0.38, JSON.stringify(result.thought));
  assert.match(result.rendered.text, /обиж|задева|осад|неприят|не\s+успел|не\s+прош/iu);
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

await test("implicit irony is understood as humor without requiring 'это шутка'", async () => {
  const nlu = analyzeLocalNLU("Ну да, конечно, просто идеально, работа опять сломалась как всегда вовремя");
  assert.equal(nlu.semantic.humor?.kind, "irony");
  assert.ok((nlu.semantic.humor?.confidence ?? 0) >= 0.75);
  assert.ok(nlu.intent === "joke" || nlu.secondaryIntents.includes("joke"));

  let found = null;
  const history = [
    { role: "user", text: "На работе сегодня всё через одно место", timestamp: NOW - 2000 },
    { role: "character", text: "Похоже, день решил не упрощать тебе жизнь.", timestamp: NOW - 1000, templateId: "old.work" },
  ];
  for (let index = 0; index < 80 && !found; index += 1) {
    const result = await renderTurn({
      text: "Ну да, конечно, просто идеально, работа опять сломалась как всегда вовремя",
      turnId: `irony_riff_${index}`,
      history,
      relationshipState: relationship("close"),
      emotionState: emotion({ happiness: 0.66, energy: 0.7, affection: 0.52, irritation: 0.08 }),
    });
    if (result.plan.spontaneousBeat?.kind === "situational_joke") found = result;
  }
  assert.ok(found, "expected Yuzuki to riff on recognized irony");
  assert.match(found.rendered.text, /идеаль|реальност|нормальн.*момент|удобн|тайминг/iu);
});

await test("humor can become a short callback on the same topic instead of being forgotten next turn", async () => {
  const history = [
    { role: "user", text: "Работа решила официально стать моим личным антагонистом", timestamp: NOW - 3000 },
    { role: "character", text: "У неё явно серьёзные карьерные планы.", timestamp: NOW - 2000, templateId: "old.joke", dialogueActs: ["JOKE"] },
    { role: "user", text: "И опять вспоминаю про неё дома", timestamp: NOW - 1000 },
  ];
  let found = null;
  for (let index = 0; index < 100 && !found; index += 1) {
    const result = await renderTurn({
      text: "Работа всё ещё не отпускает",
      turnId: `humor_callback_${index}`,
      history,
      relationshipState: relationship("close"),
      emotionState: emotion({ happiness: 0.72, energy: 0.7, affection: 0.5, irritation: 0.06 }),
    });
    if (result.plan.spontaneousBeat?.kind === "situational_joke" && result.plan.spontaneousBeat.sourceId?.endsWith(":callback")) found = result;
  }
  assert.ok(found, "expected a humor callback from recent topic continuity");
  assert.match(found.rendered.text, /внутренн.*мем|комедийн|не могу воспринимать.*серь/iu);
});

await test("topic development chooses a relevant angle instead of repeating one generic why-question", async () => {
  const history = [
    { role: "user", text: "Я думаю уйти с работы", timestamp: NOW - 5000 },
    { role: "character", text: "Ты уже давно к этому идёшь?", timestamp: NOW - 4000, templateId: "old.one" },
    { role: "user", text: "Да, работа выматывает", timestamp: NOW - 3000 },
    { role: "character", text: "Тогда это уже не просто плохой день.", timestamp: NOW - 2000, templateId: "old.two" },
  ];
  let found = null;
  for (let index = 0; index < 80 && !found; index += 1) {
    const result = await renderTurn({
      text: "Я хочу уйти с этой работы",
      turnId: `topic_angle_${index}`,
      history,
      relationshipState: relationship("close"),
      emotionState: emotion({ curiosity: 0.9, happiness: 0.46, energy: 0.7, affection: 0.46 }),
    });
    if (result.plan.spontaneousBeat?.kind === "conversation_pull") found = result;
  }
  assert.ok(found, "expected a topic development beat");
  assert.ok(["future", "consequence", "change"].includes(found.plan.spontaneousBeat?.developmentAngle));
  assert.match(found.rendered.text, /завтра|изменится|решени|следующ|дальше|важнее|сдвинул/iu);
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

await test("character opinion survives Russian case changes and reciprocal short follow-up", async () => {
  const ownFact = characterOpinionFact("удаленной работе", "negative", "autonomy");
  const memoryContext = { memories: [], facts: [ownFact], openThreads: [] };
  const direct = await renderTurn({
    text: "Ты передумала насчет удаленной работы?",
    turnId: "mind_case_direct",
    memoryContext,
  });
  assert.equal(direct.nlu.intent, "ask_character_opinion");
  assert.equal(direct.thought.topicKey, characterViewTopicKey("удаленная работа"));
  assert.equal(direct.thought.position, "negative");
  assert.equal(direct.thought.changedFrom, undefined, "asking whether she changed her mind must not itself change it");
  assert.match(direct.rendered.text, /(?:не за|позици|склонялась)/iu);

  const history = [
    { id: "mind_u1", role: "user", text: "Мне нравится удаленная работа, потому что свободы больше", timestamp: NOW - 2000 },
    { id: "mind_c1", role: "character", text: "Понимаю, почему тебе это важно.", timestamp: NOW - 1000 },
  ];
  const reciprocal = await renderTurn({ text: "А ты?", turnId: "mind_reciprocal", history, memoryContext });
  assert.equal(reciprocal.thought.position, "negative");
  assert.equal(reciprocal.thought.memoryEcho !== undefined, true);
  assert.match(reciprocal.rendered.text, /(?:не за|не поменялась|склонялась)/iu);
});

await test("character opinion changes gradually instead of flipping on one counterargument", async () => {
  const opinion = characterOpinionFact("удаленная работа", "positive", "autonomy");
  const history = [
    { id: "arg_u1", role: "user", text: "Мне нравится удаленная работа, потому что свободы больше", timestamp: NOW - 2000 },
    { id: "arg_c1", role: "character", text: "Я тут скорее за.", timestamp: NOW - 1000 },
  ];
  const first = await renderTurn({
    text: "Но разве офис не лучше из-за общения?",
    turnId: "mind_argument_first",
    history,
    memoryContext: { memories: [], facts: [opinion], openThreads: [] },
  });
  assert.equal(first.thought.position, "positive");
  assert.equal(first.thought.changedFrom, undefined);
  assert.ok(first.thought.reconsideration, "first real counterargument should create doubt");

  const second = await renderTurn({
    text: "Но ведь живое общение в офисе реально важно, разве нет?",
    turnId: "mind_argument_second",
    history,
    memoryContext: {
      memories: [],
      facts: [opinion, characterTensionFact("удаленная работа", "negative", 1)],
      openThreads: [],
    },
  });
  assert.equal(second.thought.changedFrom, "positive");
  assert.equal(second.thought.position, "mixed");
  assert.match(second.rendered.text, /(?:сдвинулась|иначе|передумала|смешанное)/iu);
});

await test("character can explain the reason behind a remembered opinion on a short why follow-up", async () => {
  const opinion = characterOpinionFact("удаленной работе", "positive", "autonomy");
  const history = [
    { id: "why_u1", role: "user", text: "Как ты относишься к удаленной работе?", timestamp: NOW - 2000 },
    { id: "why_c1", role: "character", text: "Я тут скорее за.", timestamp: NOW - 1000, dialogueActs: ["ANSWER"] },
  ];
  const result = await renderTurn({
    text: "Почему?",
    turnId: "mind_reason_followup",
    history,
    memoryContext: { memories: [], facts: [opinion], openThreads: [] },
  });
  assert.equal(result.nlu.intent, "ask_why");
  assert.equal(result.thought.position, "positive");
  assert.ok(result.thought.memoryEcho);
  assert.match(result.rendered.text, /(?:свобод|выбор|позици|мнение)/iu);
  assert.doesNotMatch(result.rendered.text, /из твоей предыдущей фразы|оттолкнулась от твоей/u);
});

await test("character certainty follow-up reflects confidence instead of rerolling an opinion", async () => {
  const opinion = characterOpinionFact("удаленной работе", "positive", "autonomy");
  const history = [
    { id: "sure_u1", role: "user", text: "Как ты относишься к удаленной работе?", timestamp: NOW - 2000 },
    { id: "sure_c1", role: "character", text: "Я тут скорее за.", timestamp: NOW - 1000, dialogueActs: ["ANSWER"] },
  ];
  const result = await renderTurn({
    text: "А ты уверена?",
    turnId: "mind_certainty_followup",
    history,
    memoryContext: { memories: [], facts: [opinion], openThreads: [] },
  });
  assert.equal(result.nlu.intent, "ask_character_opinion");
  assert.equal(result.nlu.semantic.asksCharacterView, true);
  assert.equal(result.thought.position, "positive");
  assert.match(result.rendered.text, /(?:уверен|процент|окончатель|передум|позици|мнение)/iu);
});

await test("character self-memory never leaks into user-memory slots", async () => {
  const ownFact = characterOpinionFact("риске", "cautious", "autonomy");
  const result = await renderTurn({
    text: "Что ты помнишь обо мне?",
    turnId: "mind_memory_separation",
    memoryContext: { memories: [], facts: [ownFact], openThreads: [] },
  });
  assert.doesNotMatch(result.rendered.text, /риске|Yuzuki|осторож/iu);
});


await test("relationship question with punctuation does not collapse into generic character state", async () => {
  const relationshipQuestion = await renderTurn({ text: "Как ты ко мне относишься?", turnId: "context_relationship_exact" });
  assert.equal(relationshipQuestion.nlu.intent, "ask_relationship");
  assert.match(relationshipQuestion.rendered.text, /приятел|отнош|тепло|интерес|близ|романтич/iu);
  assert.doesNotMatch(relationshipQuestion.rendered.text, /я спокойная|всё нормально|настроение/iu);

  const stateQuestion = await renderTurn({ text: "Как ты?", turnId: "context_state_short" });
  assert.equal(stateQuestion.nlu.intent, "ask_character_state");
});

await test("old vague open-loop phrase is repaired by a short 'Какой?' follow-up", async () => {
  const history = [
    { role: "user", text: "Мне нравится эта идея", timestamp: NOW - 3000 },
    { role: "character", text: "Мм, поняла тебя. Хм. Тут у меня сразу появился вопрос.", timestamp: NOW - 1000, dialogueActs: ["ACKNOWLEDGE", "CURIOSITY"] },
  ];
  const result = await renderTurn({ text: "Какой?", turnId: "context_open_loop_old", history });
  assert.equal(result.nlu.intent, "ask_followup");
  assert.ok(!result.plan.dialogueActs.includes("CLARIFY"));
  assert.match(result.rendered.text, /идея|нравится|что.*главн|что именно/iu);
  assert.doesNotMatch(result.rendered.text, /про что именно ты сейчас|потеряла|перефраз|скажи чуть/iu);
});

await test("reciprocal desire follow-up keeps the directed relationship context", async () => {
  const history = [
    { role: "user", text: "Я тебя хочу", timestamp: NOW - 3000 },
    { role: "character", text: "Угу, поняла. О, а вот за это я хочу зацепиться.", timestamp: NOW - 1000, dialogueActs: ["ACKNOWLEDGE", "CURIOSITY"] },
  ];
  const result = await renderTurn({ text: "Тоже хочешь?", turnId: "context_reciprocal_desire_old", history });
  assert.equal(result.nlu.intent, "ask_relationship");
  assert.ok(!result.plan.dialogueActs.includes("CLARIFY"));
  assert.match(result.rendered.text, /тянет|чувств|хочу|тепл|интерес|одно и то же|зеркал/iu);
  assert.doesNotMatch(result.rendered.text, /скажи иначе|угадывать|потеряла|про что именно/iu);
});

await test("character remembers her own immediate activity when user asks for details", async () => {
  const readingHistory = [
    { role: "user", text: "Что делаешь?", timestamp: NOW - 3000 },
    { role: "character", text: "Пока читаю.", timestamp: NOW - 1000, dialogueActs: ["ANSWER"] },
  ];
  const reading = await renderTurn({ text: "Что читаешь?", turnId: "context_own_reading_old", history: readingHistory });
  assert.equal(reading.nlu.intent, "ask_character_activity");
  assert.match(reading.rendered.text, /читаю|стать|эссе|текст|рассказ/iu);
  assert.doesNotMatch(reading.rendered.text, /потеряла|перефраз|уже не читаю|скажи.*по-другому/iu);

  const musicHistory = [
    { role: "user", text: "Что делаешь?", timestamp: NOW - 3000 },
    { role: "character", text: "Пока слушаю музыку.", timestamp: NOW - 1000, dialogueActs: ["ANSWER"] },
  ];
  const music = await renderTurn({ text: "Что слушаешь?", turnId: "context_own_music", history: musicHistory });
  assert.equal(music.nlu.intent, "ask_character_activity");
  assert.match(music.rendered.text, /музык|плейлист|трек|слушаю/iu);
});

await test("single-word contextual questions stay attached to Yuzuki's previous thought", async () => {
  const cases = [
    ["Где?", "Сегодня было странно.", "Я бы на твоём месте запомнила это место.", /мест|не называл/iu],
    ["Когда?", "Хочу сделать это.", "Тогда важен момент.", /момент|время|дат/iu],
    ["С кем?", "Думаю сходить куда-нибудь.", "Компания тут тоже многое меняет.", /человек|компан|кто/iu],
    ["Как?", "Я хочу всё исправить.", "Это можно попробовать сделать аккуратно.", /шаг|аккурат|разлож/iu],
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const [text, userText, characterText, expected] = cases[index];
    const history = [
      { role: "user", text: userText, timestamp: NOW - 3000 },
      { role: "character", text: characterText, timestamp: NOW - 1000, dialogueActs: ["ANSWER"] },
    ];
    const result = await renderTurn({ text, turnId: `context_elliptical_${index}`, history });
    assert.ok(["ask_followup", "ask_why"].includes(result.nlu.intent));
    assert.ok(!result.plan.dialogueActs.includes("CLARIFY"));
    assert.match(result.rendered.text, expected);
    assert.doesNotMatch(result.rendered.text, /про что именно ты сейчас|потеряла|перефраз/iu);
  }
});

await test("short 'Почему?' explains the actual reasoning instead of talking about context mechanics", async () => {
  const history = [
    { role: "user", text: "Мне кажется, это плохая идея", timestamp: NOW - 3000 },
    { role: "character", text: "Я бы с этим не спешила.", timestamp: NOW - 1000, dialogueActs: ["ANSWER"] },
  ];
  const result = await renderTurn({ text: "Почему?", turnId: "context_grounded_why", history });
  assert.equal(result.nlu.intent, "ask_why");
  assert.match(result.rendered.text, /сомнен|не уверен|напряга|решени/iu);
  assert.doesNotMatch(result.rendered.text, /не из воздуха|связала твою предыдущую фразу|контекст разговора/iu);
});

await test("'А дальше?' after a listening cue asks for the missing event, not a rephrase", async () => {
  const history = [
    { role: "user", text: "Начальник вызвал меня поговорить", timestamp: NOW - 3000 },
    { role: "character", text: "Я слушаю.", timestamp: NOW - 1000, dialogueActs: ["ACKNOWLEDGE"] },
  ];
  const result = await renderTurn({ text: "А дальше?", turnId: "context_and_then", history });
  assert.equal(result.nlu.intent, "ask_followup");
  assert.ok(!result.plan.dialogueActs.includes("CLARIFY"));
  assert.doesNotMatch(result.rendered.text, /скажи чуть конкретнее|перефраз|потеряла/iu);
});

await test("causal reasoning extracts explicit cause, consequence and condition without inventing adjacency", () => {
  const because = extractCausalRelations("Я хочу уйти с работы, потому что начальник постоянно срывается на меня");
  assert.equal(because.length, 1);
  assert.equal(because[0].cause, "начальник постоянно срывается на меня");
  assert.equal(because[0].effect, "я хочу уйти с работы");
  assert.equal(because[0].kind, "cause");

  const therefore = extractCausalRelations("Начальник постоянно срывается на меня, поэтому я хочу уйти с работы");
  assert.equal(therefore[0].kind, "consequence");
  assert.equal(therefore[0].cause, "начальник постоянно срывается на меня");

  const condition = extractCausalRelations("Если он опять сорвется, то я уволюсь");
  assert.equal(condition[0].kind, "condition");
  assert.equal(condition[0].effect, "я уволюсь");

  const unrelated = buildCausalRelations([
    { id: "a", role: "user", text: "Сегодня был дождь", timestamp: NOW - 2000 },
    { id: "b", role: "user", text: "Потом я заказал кофе", timestamp: NOW - 1000 },
  ]);
  assert.equal(unrelated.length, 0, "mere sequence must not become fake causality");
});

await test("causal reasoning resolves a reason split across two user turns", () => {
  const relations = buildCausalRelations([
    { id: "a", role: "user", text: "Я взял выходной", timestamp: NOW - 2000 },
    { id: "b", role: "character", text: "Поняла.", timestamp: NOW - 1500 },
    { id: "c", role: "user", text: "Потому что совсем не спал", timestamp: NOW - 1000 },
  ]);
  assert.ok(relations.some((relation) => relation.cause.includes("совсем не спал") && relation.effect.includes("я взял выходной")));
});

await test("causal reasoning keeps explicit multi-hop chains instead of flattening them", () => {
  const relations = extractCausalRelations(
    "Я не выспался, поэтому опоздал, из-за этого начальник разозлился, так что я думаю уйти",
  );
  assert.ok(relations.some((relation) => relation.cause.includes("я не выспался") && relation.effect.includes("опоздал")));
  assert.ok(relations.some((relation) => relation.cause.includes("опоздал") && relation.effect.includes("начальник разозлился")));
  assert.ok(relations.some((relation) => relation.cause.includes("начальник разозлился") && relation.effect.includes("я думаю уйти")));
});

await test("why-question can reconstruct more than one causal hop", async () => {
  const history = [
    {
      id: "chain-user",
      role: "user",
      text: "Я не выспался, поэтому опоздал, из-за этого начальник разозлился, так что я думаю уйти",
      timestamp: NOW - 2000,
    },
    { id: "chain-character", role: "character", text: "Понимаю, почему это накопилось.", timestamp: NOW - 1000 },
  ];
  const relations = buildCausalRelations(history);
  const result = await renderTurn({
    text: "Почему я думаю уйти?",
    history,
    causalRelations: relations,
  });
  assert.match(result.rendered.text, /не выспал|опоздал/u);
  assert.match(result.rendered.text, /начальник|разозлил/u);
  assert.match(result.rendered.text, /уйти/u);
});

await test("retrospective pass can recover an old causal thread beyond the 24-line hot context", () => {
  const history = [
    { id: "old-user", role: "user", text: "Я хотел уйти с работы, потому что начальник постоянно срывался на меня", timestamp: NOW - 100_000 },
    { id: "old-character", role: "character", text: "Похоже, тебя это реально выматывало.", timestamp: NOW - 99_000 },
  ];
  for (let index = 0; index < 36; index += 1) history.push({
    id: `filler-${index}`,
    role: index % 2 ? "character" : "user",
    text: index % 2 ? "Поняла." : "Сегодня просто обычный день.",
    timestamp: NOW - 90_000 + index * 1000,
  });
  const text = "Почему я тогда хотел уйти с работы?";
  const initial = analyzeLocalNLU(text);
  const recentFrame = buildDialogueFrame(history.slice(-24), initial);
  const contextual = resolveContextualNLU(initial, recentFrame, text);
  assert.equal(shouldUseRetrospectivePass(contextual, recentFrame, text), true);
  const retrospective = buildRetrospectiveContext(history, contextual, recentFrame, text);
  assert.equal(retrospective.recovered, true);
  assert.equal(retrospective.resolution, "causal");
  assert.equal(retrospective.inferredTopic, "work");
  assert.ok(retrospective.scannedLines > 24);
  assert.ok(retrospective.causalRelations.some((relation) => relation.cause.includes("начальник") && relation.effect.includes("уйти с работы")));
  const recovered = applyRetrospectiveNLU(contextual, retrospective, text);
  assert.equal(recovered.intent, "ask_why");
  assert.equal(recovered.topic, "work");
  assert.ok(recovered.confidence > contextual.confidence);
});

await test("causal answer uses recovered history instead of generic context talk", async () => {
  const history = [
    { id: "cause", role: "user", text: "Я хотел уйти с работы, потому что начальник постоянно срывался на меня", timestamp: NOW - 5000 },
    { id: "reaction", role: "character", text: "Похоже, тебя это реально выматывало.", timestamp: NOW - 4000 },
  ];
  const relations = buildCausalRelations(history, "Почему?");
  const result = await renderTurn({ text: "Почему?", history, causalRelations: relations });
  assert.match(result.rendered.text, /начальник|срывал/u);
  assert.doesNotMatch(result.rendered.text, /про что именно|контекст разговора|связь получилась натянутой/u);
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
