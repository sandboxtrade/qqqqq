import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

globalThis.window = {
  setTimeout,
  clearTimeout,
};

let fetchCalls = [];
let reply = {
  status: 200,
  body: {
    text: "Да, я поняла, о чём ты.\nПросто я бы тут не спешила с выводом.",
    messages: [
      "Да, я поняла, о чём ты.",
      "Просто я бы тут не спешила с выводом.",
    ],
    model: "gpt-6-luna",
    usage: {
      inputTokens: 720,
      cachedInputTokens: 10,
      cacheWriteTokens: 0,
      outputTokens: 28,
      estimatedCostUsd: 0.000086,
    },
    budget: {
      requestChars: 4200,
      originalRequestChars: 5100,
      estimatedInputTokens: 1800,
      estimatedMaxCostUsd: 0.00031,
      compacted: true,
      compactionSteps: ["recent-8"],
    },
    conversation: {
      topic: "вчерашний разговор",
      continuesPrevious: true,
      openThread: "",
    },
    signals: {
      userTone: "neutral",
      relationshipEvent: "none",
      memoryCandidate: "",
      memoryUsed: true,
      emotionTone: "warm",
    },
  },
};

globalThis.fetch = async (url, options) => {
  fetchCalls.push({ url: String(url), options });
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "Content-Type": "application/json" },
  });
};

let idTokenCalls = 0;
let appCheckTokenCalls = 0;
globalThis.__authMock = {
  getAuth: () => ({
    currentUser: {
      getIdToken: async (forceRefresh) => {
        idTokenCalls += 1;
        assert.equal(forceRefresh, false);
        return "firebase-id-token";
      },
    },
  }),
};

globalThis.__firebaseMock = {
  isFirebaseConfigured: true,
  getFirebaseApp: () => ({ name: "app" }),
  getFirebaseAppCheckToken: async (forceRefresh) => {
    appCheckTokenCalls += 1;
    assert.equal(forceRefresh, false);
    return "app-check-token";
  },
};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "firebase/auth") return { url: "mock:auth", shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const candidate = new URL(specifier, context.parentURL);
      if (!candidate.pathname.match(/\.[a-z0-9]+$/iu) && existsSync(fileURLToPath(candidate) + ".ts"))
        return { url: candidate.href + ".ts", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "mock:auth")
      return { source: "export const {getAuth}=globalThis.__authMock;", format: "module", shortCircuit: true };
    if (url.endsWith("/storage/firebase.ts"))
      return {
        source: "export const {isFirebaseConfigured,getFirebaseApp,getFirebaseAppCheckToken}=globalThis.__firebaseMock;",
        format: "module",
        shortCircuit: true,
      };
    if (url.endsWith("/config/runtime-config.ts"))
      return {
        source: 'export const runtimeCloudLanguageEndpoint="https://shy-unit-ebfb.ermilov-stepa228337.workers.dev/yuzukiSpeak";',
        format: "module",
        shortCircuit: true,
      };
    if (url.endsWith(".ts"))
      return { source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "transform" }), format: "module", shortCircuit: true };
    return next(url, context);
  },
});

const { shouldUseCloudLanguage, renderCloudLanguage } = await import("../src/ai/cloud-language.ts");

const base = {
  userText: "Я всё думаю о том разговоре вчера, как ты это видишь?",
  localDraft: "Я бы не делала из этого быстрый вывод.",
  intent: "ask_for_opinion",
  dialogueActs: ["ANSWER"],
  goal: "answer",
  tone: "warm",
  length: "short",
  semantic: {
    topic: "conversation",
    focus: "вчерашний разговор",
    subject: "shared",
    stance: "ask_opinion",
    questionType: "what",
    isQuestion: true,
    reciprocal: false,
    asksCharacterView: true,
    wantsAdvice: false,
    wantsListening: false,
    confidence: 0.92,
  },
  decision: {
    action: "answer",
    mode: "personal_stance",
    stance: "mixed",
    summary: "Ответить по существу, сохраняя уже сформированное отношение.",
    locked: true,
    shouldAskFollowUp: false,
    shouldReferenceMemory: true,
  },
  continuity: {
    currentTopic: "conversation",
    previousTopic: "conversation",
    previousUserText: "Вчера мы об этом уже говорили.",
    previousCharacterText: "Я бы не делала из этого быстрый вывод.",
    lastUserIntent: "statement",
    lastCharacterIntent: "ANSWER",
    turnsOnTopic: 3,
  },
  world: {
    timeOfDay: "evening",
    location: "living_room",
    activity: "relaxing",
    availability: "free",
    isAwake: true,
    activityDetail: "просто лежу и даю голове немного затихнуть",
  },
  relationship: { stage: "close", trust: 0.7, closeness: 0.7, attachment: 0.6, security: 0.7, respect: 0.8, unresolvedTension: 0.1 },
  emotion: { mood: 0.6, energy: 0.55, happiness: 0.5, sadness: 0.1, irritation: 0.1, anxiety: 0.1, curiosity: 0.6, boredom: 0.1, affection: 0.7, romanticInterest: 0.4 },
  romancePhase: "neutral",
  intimacy: {
    enabled: false,
    phase: "normal",
    interactionStatus: "inactive",
    comfort: 0,
    interest: 0,
    arousal: 0,
    initiativeDrive: 0,
    signal: { kind: "none", strength: 0, explicit: false, intimacyContext: false },
    mind: {
      active: false,
      tenderness: 0,
      desire: 0,
      caution: 0,
      playfulness: 0,
      confidence: 0,
      conflicted: false,
      preferredPace: "slow",
      inwardArousal: false,
      outwardArousal: false,
      wantsCloseness: false,
      wantsMore: false,
      activePreferenceKeys: [],
      reflection: "Intimacy is not currently active in her attention.",
    },
  },
  thought: { interpretation: "Пользователь возвращается к важной теме.", stance: "Не торопиться с выводом." },
  recentHistory: [
    { role: "user", text: "Вчера мы об этом уже говорили." },
    { role: "character", text: "Я бы не делала из этого быстрый вывод." },
  ],
  recoveredHistory: [],
  memories: [{
    summary: "Вчерашний разговор был важен пользователю.",
    kind: "episodic",
    importance: 0.8,
    emotionalWeight: 0.7,
    confidence: 0.9,
    retrievalStrength: 0.8,
  }],
  facts: [{ statement: "Пользователь не любит поспешные выводы.", subject: "user", confidence: 0.85 }],
  openThreads: [{ summary: "Вернуться к вчерашнему разговору.", priority: 0.7 }],
  causal: [],
  locked: false,
  silent: false,
};

assert.equal(shouldUseCloudLanguage(base), true);
// v0.17: GPT is the default conversation path even for simple and intimate turns.
assert.equal(shouldUseCloudLanguage({
  ...base,
  intent: "greeting",
  userText: "Привет",
  semantic: { ...base.semantic, isQuestion: false, reciprocal: false },
}), true);
assert.equal(shouldUseCloudLanguage({
  ...base,
  intent: "short_yes",
  userText: "Точно?",
  semantic: { ...base.semantic, isQuestion: true, reciprocal: true, questionType: "yes_no" },
  continuity: { ...base.continuity, previousCharacterText: "Нет, я сейчас не злюсь." },
}), true);
assert.equal(shouldUseCloudLanguage({ ...base, locked: true }), true);
assert.equal(shouldUseCloudLanguage({
  ...base,
  intimacy: {
    ...base.intimacy,
    enabled: true,
    phase: "high_intimacy",
    interactionStatus: "open",
    comfort: 1,
    interest: 1,
    arousal: 1,
    initiativeDrive: 0.8,
    signal: { kind: "flirt", strength: 0.9, explicit: false, intimacyContext: true },
    mind: {
      ...base.intimacy.mind,
      active: true,
      desire: 0.9,
      playfulness: 0.8,
      confidence: 0.8,
      inwardArousal: true,
      outwardArousal: true,
      wantsCloseness: true,
      wantsMore: true,
      preferredPace: "responsive",
      reflection: "The attraction is strong enough to show in her wording.",
    },
  },
}), true);
assert.equal(shouldUseCloudLanguage({ ...base, silent: true }), false);

const result = await renderCloudLanguage(base);
assert.equal(result.used, true);
assert.equal(result.model, "gpt-6-luna");
assert.equal(result.usage?.cacheWriteTokens, 0);
assert.equal(result.budget?.compacted, true);
assert.equal(result.budget?.requestChars, 4200);
assert.deepEqual(result.budget?.compactionSteps, ["recent-8"]);
assert.equal(result.conversation?.continuesPrevious, true);
assert.equal(result.conversation?.topic, "вчерашний разговор");
assert.equal(result.signals?.userTone, "neutral");
assert.equal(result.signals?.memoryUsed, true);
assert.equal(result.signals?.emotionTone, "warm");
assert.deepEqual(result.messages, [
  "Да, я поняла, о чём ты.",
  "Просто я бы тут не спешила с выводом.",
]);
assert.equal(idTokenCalls, 1);
assert.equal(appCheckTokenCalls, 1);
assert.equal(fetchCalls.length, 1);
assert.equal(fetchCalls[0].url, "https://shy-unit-ebfb.ermilov-stepa228337.workers.dev/yuzukiSpeak");
assert.equal(fetchCalls[0].options.method, "POST");
assert.equal(fetchCalls[0].options.headers.Authorization, "Bearer firebase-id-token");
assert.equal(fetchCalls[0].options.headers["X-Firebase-AppCheck"], "app-check-token");
assert.equal(fetchCalls[0].options.credentials, "omit");
assert.equal(fetchCalls[0].options.cache, "no-store");
assert.equal(JSON.parse(fetchCalls[0].options.body).userText, base.userText);
assert.equal(JSON.parse(fetchCalls[0].options.body).world.activity, "relaxing");
assert.equal(JSON.parse(fetchCalls[0].options.body).memories[0].importance, 0.8);
assert.equal(JSON.parse(fetchCalls[0].options.body).emotion.energy, 0.55);
assert.equal(JSON.parse(fetchCalls[0].options.body).intimacy.signal.kind, "none");
assert.equal(JSON.parse(fetchCalls[0].options.body).intimacy.mind.inwardArousal, false);

reply = {
  status: 200,
  body: { skipped: true, reason: "server-budget", model: "gpt-6-luna", budget: { estimatedMaxCostUsd: 0.0005 } },
};
const skipped = await renderCloudLanguage({ ...base, userText: base.userText + " ещё" });
assert.equal(skipped.attempted, true);
assert.equal(skipped.used, false);
assert.equal(skipped.reason, "server-budget");
assert.equal(skipped.budget?.estimatedMaxCostUsd, 0.0005);

const callsBeforeLocal = fetchCalls.length;
const localOnly = await renderCloudLanguage({ ...base, silent: true });
assert.equal(localOnly.attempted, false);
assert.equal(localOnly.reason, "local-route");
assert.equal(fetchCalls.length, callsBeforeLocal);

console.log("PASS cloud dialogue: GPT-first routing, multi-bubble replies, memory/emotion context, Cloudflare transport, Auth, App Check, metadata, telemetry and local fallback");
