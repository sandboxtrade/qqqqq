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
    text: "Да, я поняла, о чём ты. Тут я бы не спешила с выводом.",
    model: "gpt-6-luna",
    usage: {
      inputTokens: 720,
      cachedInputTokens: 10,
      cacheWriteTokens: 0,
      outputTokens: 28,
      estimatedCostUsd: 0.000086,
    },
    budget: {
      requestChars: 2140,
      originalRequestChars: 2510,
      estimatedInputTokens: 900,
      estimatedMaxCostUsd: 0.00019,
      compacted: true,
      compactionSteps: ["recent-2"],
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
  relationship: { stage: "close", trust: 0.7, closeness: 0.7, attachment: 0.6, security: 0.7, unresolvedTension: 0.1 },
  emotion: { mood: 0.6, happiness: 0.5, sadness: 0.1, irritation: 0.1, anxiety: 0.1, affection: 0.7, curiosity: 0.6, romanticInterest: 0.4 },
  romancePhase: "neutral",
  intimacy: { enabled: false, phase: "normal", comfort: 0, interest: 0, arousal: 0 },
  thought: { interpretation: "Пользователь возвращается к важной теме.", stance: "Не торопиться с выводом." },
  recentHistory: [{ role: "user", text: "Вчера мы об этом уже говорили." }],
  memories: ["Вчерашний разговор был важен пользователю."],
  facts: [],
  openThreads: [],
  causal: [],
  locked: false,
  silent: false,
};

assert.equal(shouldUseCloudLanguage(base), true);
assert.equal(shouldUseCloudLanguage({ ...base, intent: "greeting", userText: "Привет" }), false);
assert.equal(shouldUseCloudLanguage({ ...base, locked: true }), false);
assert.equal(shouldUseCloudLanguage({ ...base, intimacy: { enabled: true, phase: "high_intimacy", comfort: 1, interest: 1, arousal: 1 } }), false);

const result = await renderCloudLanguage(base);
assert.equal(result.used, true);
assert.equal(result.model, "gpt-6-luna");
assert.equal(result.usage?.cacheWriteTokens, 0);
assert.equal(result.budget?.compacted, true);
assert.equal(result.budget?.requestChars, 2140);
assert.deepEqual(result.budget?.compactionSteps, ["recent-2"]);
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
const localOnly = await renderCloudLanguage({ ...base, intent: "greeting", userText: "Привет" });
assert.equal(localOnly.attempted, false);
assert.equal(localOnly.reason, "local-route");
assert.equal(fetchCalls.length, callsBeforeLocal);

console.log("PASS cloud language: Cloudflare transport, Auth, App Check, local routing, telemetry and budget fallback");
