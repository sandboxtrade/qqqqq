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
const { defaultCharacter } = await import("../src/character/default-character.ts");
const { initialEmotionalState, deriveMood } = await import("../src/emotions/emotion-engine.ts");
const { initialRelationshipState } = await import("../src/relationship/relationship-engine.ts");
const { createInitialWorldState } = await import("../src/world/world-engine.ts");

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
} = {}) {
  const initialNlu = analyzeLocalNLU(text);
  const frame = buildDialogueFrame(history, initialNlu);
  const nlu = resolveContextualNLU(initialNlu, frame);
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
  const resolved = resolveContextualNLU(initial, buildDialogueFrame(history, initial));
  assert.equal(resolved.intent, "user_dont_want");
  assert.ok(resolved.confidence >= 0.7);
  const result = await renderTurn({ text: "Не хочу туда", turnId: "ctx_work", history });
  assert.match(result.rendered.text, /туда|возвращаться|день|выматывает/iu);
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
