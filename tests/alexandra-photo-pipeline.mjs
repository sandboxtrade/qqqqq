import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync, sign as rsaSign } from "node:crypto";
import worker from "../cloudflare/worker.js";

const origin = "http://localhost:5173";
const base = "https://example.workers.dev";
const firebaseProjectNumber = "1068767940128";
const firebaseAppId = "1:1068767940128:web:3dc2a06b8a867548c13645";
const keyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = keyPair.publicKey.export({ format: "jwk" });
const appHeader = { alg: "RS256", typ: "JWT", kid: "photo-test-key" };
function base64url(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
const body = base64url({ iss: `https://firebaseappcheck.googleapis.com/${firebaseProjectNumber}`,
  aud: [`projects/${firebaseProjectNumber}`], sub: firebaseAppId,
  exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000),
});
const message = `${base64url(appHeader)}.${body}`;
const jwt = `${message}.${rsaSign("RSA-SHA256", Buffer.from(message), keyPair.privateKey).toString("base64url")}`;
const authHeader = {
  "Content-Type": "application/json",
  "Authorization": "Bearer valid-test-user",
  "X-Firebase-AppCheck": jwt,
  Origin: origin,
};
const env = {
  OPENAI_API_KEY: "mock-openai-key", PHOTO_SIGNING_KEY: "mock-signing-secret",
  WAVESPEED_API_KEY: "mock-wave-key", ALEXANDRA_LORA_URL: "https://cdn.example.org/model/alexandra.safetensors",
  ALEXANDRA_LORA_SCALE: "0.85", OPENAI_TEXT_MODEL: "mock-gpt",
};
const finishedImage = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBpYAAAAASUVORK5CYII=", "base64");
const finalChatPrompt = "g2girl01, photorealistic casual smartphone selfie at an office desk, working with documents, modest white blouse, slightly tired expression, afternoon window light, natural camera perspective";
const finalPresencePrompt = "g2girl01, natural candid documentary photograph of one adult woman at her desk in a busy modern office, typing at a laptop, papers and planner nearby, modest professional outfit, authentic indoor lighting, believable camera snapshot, 3:4 composition";
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }); }
function installMocks(calls) {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init, payload: init.body && String(init.body).startsWith("{") ? JSON.parse(init.body) : null });
    if (url.includes("firebaseappcheck.googleapis.com/v1/jwks")) return json({ keys: [{ ...jwk, kid: "photo-test-key", alg: "RS256", use: "sig" }] });
    if (url.includes("identitytoolkit.googleapis.com")) return json({ users: [{ localId: "photo-test-user" }] });
    if (url === "https://api.openai.com/v1/responses") {
      const payload = JSON.parse(init.body);
      if (payload.text.format.name === "alexandra_presence_prompt")
        return json({ output_text: JSON.stringify({ prompt: finalPresencePrompt }) });
      return json({ output_text: JSON.stringify({
        messages: ["Ладно, сфоткаюсь у стола)"], shouldInitiate: false,
        emotionReaction: Object.fromEntries(["happiness", "sadness", "irritation", "anxiety", "curiosity", "boredom", "affection", "romanticInterest"].map(x => [x, 0])),
        relationshipReaction: Object.fromEntries(["trust", "closeness", "attachment", "security", "respect", "unresolvedTension"].map(x => [x, 0])),
        intimacyReaction: Object.fromEntries(["comfort", "interest", "arousal", "initiativeDrive"].map(x => [x, 0])),
        photoDecision: { shouldSendPhoto: true, reason: "user_requested", caption: "Держи)", prompt: finalChatPrompt,
          intent: { framing: "selfie", mood: "slightly tired", pose: "holding phone", location: "office", outfit: "white blouse", suggestiveLevel: "none" } },
      }) });
    }
    if (url.endsWith("/wavespeed-ai/z-image/turbo-lora")) return json({ data: { id: "mock-task-xyz", status: "created" } });
    if (url.endsWith("/predictions/mock-task-xyz/result")) return json({ data: { status: "completed", outputs: ["https://cdn.wavespeed.ai/images/photo.png"] } });
    if (url === "https://cdn.wavespeed.ai/images/photo.png") return new Response(finishedImage, { status: 200, headers: { "Content-Type": "image/png" } });
    throw new Error(`UNEXPECTED_FETCH ${url}`);
  };
  return () => { globalThis.fetch = oldFetch; };
}
async function call(path, payload) {
  const request = new Request(`${base}${path}`, { method: "POST", headers: authHeader, body: JSON.stringify(payload) });
  const response = await worker.fetch(request, env);
  return { status: response.status, data: await response.json() };
}
const dialogueInput = {
  character: { id: "alexandra_v1", name: "Александра", age: 25 },
  mode: "reply", userText: "Саш, пришли селфи с работы", relationship: { trust: 0.1, closeness: 0.1 },
  world: { currentActivity: "personal_project", currentLocation: "office" },
  recentHistory: [],
};

test("GPT decision -> server signed prompt -> WaveSpeed LoRA submit -> signed polling -> locally cacheable image", async () => {
  const calls = [];
  const restore = installMocks(calls);
  try {
    const dialogue = await call("/yuzukiSpeak", dialogueInput);
    assert.equal(dialogue.status, 200);
    assert.equal(dialogue.data.photoDecision.shouldSendPhoto, true);
    assert.equal(dialogue.data.photoDecision.prompt, finalChatPrompt);
    assert.match(dialogue.data.photoDecision.authorization, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    const start = await call("/yuzukiPhoto", { character: dialogueInput.character, decision: dialogue.data.photoDecision });
    assert.equal(start.status, 200);
    assert.equal(start.data.pending, true);
    assert.equal(start.data.provider, "wavespeed");
    assert.equal(start.data.model, "wavespeed-ai/z-image/turbo-lora");
    const submitted = calls.find(x => x.url.endsWith("/wavespeed-ai/z-image/turbo-lora"));
    assert.deepEqual(submitted.payload.loras, [{ path: env.ALEXANDRA_LORA_URL, scale: 0.85 }]);
    assert.equal(submitted.payload.size, "1024*1536");
    assert.equal(submitted.payload.seed, -1);
    assert.equal(submitted.payload.prompt, finalChatPrompt);
    const completed = await call("/yuzukiPhotoResult", { taskId: start.data.providerTaskId, taskToken: start.data.taskToken });
    assert.equal(completed.status, 200, JSON.stringify(completed.data));
    assert.match(completed.data.dataUrl, /^data:image\/png;base64,/u);
    assert.equal(completed.data.provider, "wavespeed");
    assert.ok(!calls.some(x => x.url.includes("/v1/images/")), "GPT image API is inactive");
    assert.ok(!calls.some(x => /seedream|qwen-image/u.test(x.url)), "old WaveSpeed routes are inactive");
  } finally { restore(); }
});

test("old nearby photo route is gone and never calls paid provider", async () => {
  const calls = [];
  const restore = installMocks(calls);
  try {
    const result = await call("/alexandraPresencePhoto", { characterId: "alexandra_v1", activity: "reading" });
    assert.equal(result.status, 404);
    assert.ok(!calls.some(x => x.url.includes("api.wavespeed.ai")));
  } finally { restore(); }
});

test("Forged or modified GPT prompt cannot reach the paid WaveSpeed submit", async () => {
  const calls = [];
  const restore = installMocks(calls);
  try {
    const forged = await call("/yuzukiPhoto", { character: dialogueInput.character,
      decision: { shouldSendPhoto: true, prompt: "g2girl01, this is a forged prompt", authorization: "forged.invalid" } });
    assert.equal(forged.status, 403);
    const speak = await call("/yuzukiSpeak", dialogueInput);
    const tampered = await call("/yuzukiPhoto", { character: dialogueInput.character,
      decision: { ...speak.data.photoDecision, prompt: "g2girl01, tampered prompt" } });
    assert.equal(tampered.status, 403);
    assert.equal(calls.filter(x => x.url.endsWith("/wavespeed-ai/z-image/turbo-lora")).length, 0);
  } finally { restore(); }
});

test("LoRA default is server-only and Worker key remains required", async () => {
  const calls = [];
  const restore = installMocks(calls);
  const original = env.ALEXANDRA_LORA_URL;
  env.ALEXANDRA_LORA_URL = "";
  try {
    const dialogue = await call("/yuzukiSpeak", dialogueInput);
    const generated = await call("/yuzukiPhoto", { character: dialogueInput.character, decision: dialogue.data.photoDecision });
    assert.equal(generated.status, 200);
    const submit = calls.find(x => x.url.endsWith("/wavespeed-ai/z-image/turbo-lora"));
    assert.match(submit.payload.loras[0].path, /^https:\/\/d2h7xmz5gqybh9\.cloudfront\.net\//u);
  } finally { env.ALEXANDRA_LORA_URL = original; restore(); }
});
