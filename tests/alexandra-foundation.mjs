import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { test } from "node:test";
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("single Alexandra identity and isolated persistence ID", () => {
  const registry = source("src/character/character-registry.ts");
  assert.match(registry, /ALEXANDRA_ID = "alexandra_v1"/u);
  assert.match(source("src/character/character.ts"), /age: 25/u);
  assert.match(registry, /characterProfiles: readonly SocialCharacterProfile\[\] = \[alexandraProfile\]/u);
  assert.doesNotMatch(registry, /mika_v1|yuzuki_v1|diana_v1|alia_v1/u);
  assert.match(source("src/character/character.ts"), /id: "alexandra_v1"/u);
});

test("initial relationship and romantic interest are zero", () => {
  const r = source("src/relationship/relationship.ts");
  const init = r.split('export const initialRelationshipState: RelationshipState = {')[1].split('};')[0];
  for (const key of ["trust","closeness","attachment","security","respect","unresolvedTension"])
    assert.match(init, new RegExp(`\\b${key}: 0,`));
  const e = source("src/emotions/emotions.ts");
  assert.match(e, /affection: 0,/u);
  assert.match(e, /romanticInterest: 0,/u);
  const intimacy = source("src/intimacy/intimacy.ts");
  assert.match(intimacy, /relationship\.trust < 0\.38/u);
});

test("four tabs, social contacts and user profile replace the old nearby scene", () => {
  const app = source("src/App.tsx");
  for (const label of [">Чат<", ">Люди<", ">Соцсеть<", ">Профиль<"]) assert.ok(app.includes(label), label);
  assert.doesNotMatch(app, /AlexandraPresence|fetchPresenceSnapshot|>Рядом</u);
  assert.equal(existsSync(new URL("../src/ui/AlexandraPresence.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/ai/presence-photo.ts", import.meta.url)), false);
});

test("inactive legacy providers remain in source while WaveSpeed LoRA is active in chat", () => {
  const worker = source("cloudflare/worker.js");
  assert.doesNotMatch(worker, /\/alexandraPresencePhoto/u);
  assert.match(worker, /wavespeed-ai\/z-image\/turbo-lora/u);
  assert.match(worker, /ALEXANDRA_LORA_URL/u);
  assert.match(worker, /gpt-image-2/u);
  for (const provider of ["api.wavespeed.ai", "seedream-v4.5", "seedream-v5.0-lite", "qwen-image", "/yuzukiPhoto", "/yuzukiPhotoResult"]) assert.ok(worker.includes(provider), provider);
  assert.match(worker, /verifyAppCheckToken/u);
  assert.match(worker, /verifyFirebaseAuth/u);
});

test("wallet debits atomically, profile is additive and offers never force affection", () => {
  const data = source("src/storage/player-data.ts");
  const people = source("src/ui/PeopleScreen.tsx");
  const profile = source("src/ui/MyProfile.tsx");
  const registry = source("src/character/character-registry.ts");
  assert.match(data, /runTransaction/u);
  assert.match(data, /users", uid, "player"/u);
  assert.match(data, /INITIAL_VIRTUAL_BALANCE/u);
  assert.match(data, /discoverable/u);
  assert.match(data, /transactions\.some/u);
  assert.match(people, /Подтвердить/u);
  assert.match(profile, /Сохранить профиль/u);
  assert.match(registry, /characterProfiles\.find/u);
  assert.doesNotMatch(data, /relationshipReaction|affection/u);
});

test("Worker keeps protected photo routes and rejects unauthenticated dialogue", async () => {
  const worker = (await import("../cloudflare/worker.js")).default;
  const origin = "http://localhost:5173";
  const env = {};
  const health = await worker.fetch(new Request("https://example.workers.dev/health", { headers: { Origin: origin } }), env);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).imageModel, "wavespeed-ai/z-image/turbo-lora");
  assert.equal(health.headers.get("Access-Control-Allow-Origin"), origin);
  const deprecated = await worker.fetch(new Request("https://example.workers.dev/yuzukiPhoto", { method: "POST", headers: { Origin: origin } }), env);
  assert.equal(deprecated.status, 401);
  const unauthorized = await worker.fetch(new Request("https://example.workers.dev/yuzukiSpeak", { method: "POST", headers: { Origin: origin } }), env);
  assert.equal(unauthorized.status, 401);
});

test("all relative module imports refer to real source files", () => {
  const visit = dir => readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? visit(join(dir, item.name)) : [join(dir, item.name)]);
  for (const sourcePath of visit(new URL("../src/", import.meta.url).pathname).filter(name => /\.(tsx?|jsx?)$/.test(name))) {
    const code = readFileSync(sourcePath, "utf8");
    const re = /\b(?:from\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/gu;
    for (const match of code.matchAll(re)) {
      const full = resolve(dirname(sourcePath), match[1]);
      assert.ok([full, `${full}.ts`, `${full}.tsx`, `${full}.json`, `${full}.js`, join(full, "index.ts")].some(existsSync), `${sourcePath}: ${match[1]}`);
    }
  }
});


test("photo client retains WaveSpeed job polling, recovery and auth", () => {
  const service = source("src/ai/cloud-photo.ts");
  for (const term of ["WAVESPEED_MAX_POLL_ATTEMPTS", "workerPhotoResultEndpoint", "requestWaveSpeedKeyRetry", "generateCloudPhoto", "getFirebaseAppCheckToken"]) assert.ok(service.includes(term), term);
  assert.doesNotMatch(service, /legacy-chat-photo-disabled/u);
});

test("schema 4 and new 0.21.3 screen modules persist", () => {
  assert.match(source("src/config/version.ts"), /SCHEMA_VERSION = 4/u);
  assert.match(source("src/config/version.ts"), /ENGINE_VERSION = "0\.21\.3"/u);
  for (const file of ["src/ui/PeopleScreen.tsx", "src/ui/MyProfile.tsx", "src/ui/AlexandraSocial.tsx", "src/ui/ChatScreen.tsx"]) assert.ok(source(file).length > 200, file);
});

test("generic Firebase AI / Gemini client remains available without re-enabling old characters", () => {
  const generic = source("src/ai/gemini-client.ts");
  assert.match(generic, /GoogleAIBackend/u);
  assert.match(generic, /getGenerativeModel/u);
});
