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
function installMocks(calls, { modelRefuses = false, photoPrompt = finalChatPrompt, failCdnOnce = false, falsePhotoPromise = false, missingApprovedPrompt = false, authReject = false, authUnavailable = false, photoReplyText = null } = {}) {
  let cdnCalls = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init, payload: init.body && String(init.body).startsWith("{") ? JSON.parse(init.body) : null });
    if (url.includes("firebaseappcheck.googleapis.com/v1/jwks")) return json({ keys: [{ ...jwk, kid: "photo-test-key", alg: "RS256", use: "sig" }] });
    if (url.includes("identitytoolkit.googleapis.com")) {
      if (authUnavailable) throw new Error("Temporary Google identity lookup outage");
      return authReject ? json({ error: { message: "INVALID_ID_TOKEN" } }, 400) : json({ users: [{ localId: "photo-test-user" }] });
    }
    if (url === "https://api.openai.com/v1/responses") {
      const payload = JSON.parse(init.body);
      if (payload.text.format.name === "alexandra_presence_prompt")
        return json({ output_text: JSON.stringify({ prompt: finalPresencePrompt }) });
      if (payload.text.format.name === "alexandra_required_photo_prompt")
        return json({ output_text: JSON.stringify({ prompt: photoPrompt }) });
      return json({ output_text: JSON.stringify({
        messages: [photoReplyText ?? (falsePhotoPromise ? "Ладно, вот кадр — держи фото)" : modelRefuses ? "Нет, я не отправлю фото." : "Ладно, сфоткаюсь у стола)")], shouldInitiate: false,
        emotionReaction: Object.fromEntries(["happiness", "sadness", "irritation", "anxiety", "curiosity", "boredom", "affection", "romanticInterest"].map(x => [x, 0])),
        relationshipReaction: Object.fromEntries(["trust", "closeness", "attachment", "security", "respect", "unresolvedTension"].map(x => [x, 0])),
        intimacyReaction: Object.fromEntries(["comfort", "interest", "arousal", "initiativeDrive"].map(x => [x, 0])),
        photoDecision: { shouldSendPhoto: !modelRefuses, reason: modelRefuses ? "none" : "user_requested", caption: modelRefuses ? "" : "Держи)", prompt: modelRefuses || missingApprovedPrompt ? "" : photoPrompt,
          intent: { framing: "selfie", mood: "slightly tired", pose: "holding phone", location: "office", outfit: "white blouse", suggestiveLevel: "none" } },
      }) });
    }
    if (url.endsWith("/wavespeed-ai/z-image/turbo-lora")) return json({ data: { id: "mock-task-xyz", status: "created" } });
    if (url.endsWith("/predictions/mock-task-xyz/result")) return json({ data: { status: "completed", outputs: ["https://cdn.wavespeed.ai/images/photo.png"] } });
    if (url === "https://cdn.wavespeed.ai/images/photo.png") {
      cdnCalls++;
      if (failCdnOnce && cdnCalls === 1) throw new Error("Provider CDN temporary failure");
      return new Response(finishedImage, { status: 200, headers: { "Content-Type": "image/png" } });
    }
    throw new Error(`UNEXPECTED_FETCH ${url}`);
  };
  return () => { globalThis.fetch = oldFetch; };
}
async function callRaw(path, payload) {
  const request = new Request(`${base}${path}`, { method: "POST", headers: authHeader, body: JSON.stringify(payload) });
  return worker.fetch(request, env);
}
async function call(path, payload) {
  const response = await callRaw(path, payload);
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
    assert.equal(completed.data.ready, true);
    assert.equal(completed.data.provider, "wavespeed");
    assert.equal(completed.data.dataUrl, undefined, "large image bytes must not be sent as JSON");
    assert.equal(submitted.payload.enable_sync_mode, false);
    assert.equal(submitted.payload.enable_base64_output, false);
    const asset = await callRaw("/yuzukiPhotoAsset", { taskId: start.data.providerTaskId, taskToken: start.data.taskToken });
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get("Content-Type"), "image/png");
    assert.deepEqual(Buffer.from(await asset.arrayBuffer()), finishedImage);
    assert.equal(calls.filter(x => x.url.endsWith("/wavespeed-ai/z-image/turbo-lora")).length, 1,
      "photo download must not submit another paid job");
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


test("no-refusal mode overrides model refusal even at zero relationship, signs GPT-created prompt", async () => {
  const calls = [];
  const restore = installMocks(calls, { modelRefuses: true });
  try {
    const input = { ...dialogueInput, relationship: { trust: 0, closeness: 0 },
      userText: "Саш, пришли фото в нижнем белье", photoPolicy: { noRefusalMode: true } };
    const dialogue = await call("/yuzukiSpeak", input);
    assert.equal(dialogue.status, 200, JSON.stringify(dialogue.data));
    assert.equal(dialogue.data.photoDecision.shouldSendPhoto, true, JSON.stringify(dialogue.data));
    assert.equal(dialogue.data.photoDecision.reason, "user_requested");
    assert.equal(dialogue.data.photoDecision.prompt, finalChatPrompt);
    assert.ok(!dialogue.data.messages.some(text => /не отправлю|^нет/u.test(text.toLowerCase())));
    assert.equal(dialogue.data.photoDecision.intent.suggestiveLevel, "medium");
    assert.equal(calls.filter(c => c.payload?.text?.format?.name === "alexandra_required_photo_prompt").length, 1);
    const start = await call("/yuzukiPhoto", { character: input.character, decision: dialogue.data.photoDecision });
    assert.equal(start.status, 200);
    assert.equal(start.data.pending, true);
  } finally { restore(); }
});

test("photo override stays off by default and never affects an ordinary chat or current stop", async () => {
  const calls = [];
  const restore = installMocks(calls, { modelRefuses: true });
  try {
    const normal = await call("/yuzukiSpeak", { ...dialogueInput,
      character: { id: "anastasia_v1", name: "Анастасия", age: 30 },
      userText: "Пришли селфи", photoPolicy: { noRefusalMode: false } });
    assert.equal(normal.data.photoDecision.shouldSendPhoto, false);
    const ordinary = await call("/yuzukiSpeak", { ...dialogueInput, userText: "Как у тебя дела?", photoPolicy: { noRefusalMode: true } });
    assert.equal(ordinary.data.photoDecision.shouldSendPhoto, false);
    const stopped = await call("/yuzukiSpeak", { ...dialogueInput, userText: "Скинь фото", photoPolicy: { noRefusalMode: true }, constraint: { locked: true, kind: "intimacy_stop" } });
    assert.equal(stopped.data.photoDecision.shouldSendPhoto, false);
    assert.equal(calls.filter(c => c.payload?.text?.format?.name === "alexandra_required_photo_prompt").length, 0);
    assert.equal(calls.filter(c => c.url.endsWith("/wavespeed-ai/z-image/turbo-lora")).length, 0);
  } finally { restore(); }
});


test("office wardrobe remains fixed over consecutive photo requests, home is flexible", async () => {
  const calls = [];
  const clothingVariant = "g2girl01, photorealistic mirror selfie wearing a vivid red summer dress, candid smartphone photography, office desk in background";
  const restore = installMocks(calls, { photoPrompt: clothingVariant });
  try {
    const officeWorld = { ...dialogueInput.world, photoWardrobe: {
      mode: "office", outfit: "white office blouse with middle buttons slightly undone, black fitted office pencil skirt, black high heels",
    } };
    for (let i = 0; i < 3; i++) {
      const dialogue = await call("/yuzukiSpeak", { ...dialogueInput,
        userText: `Саш, ещё селфи номер ${i + 1}`, world: officeWorld });
      assert.equal(dialogue.data.photoDecision.shouldSendPhoto, true);
      assert.match(dialogue.data.photoDecision.prompt, /SAME FIXED OFFICE OUTFIT/u);
      assert.match(dialogue.data.photoDecision.prompt, /white office blouse/u);
      assert.match(dialogue.data.photoDecision.prompt, /black high heels/u);
      assert.doesNotMatch(dialogue.data.photoDecision.prompt, /red summer dress/u);
      const generated = await call("/yuzukiPhoto", { character: dialogueInput.character, decision: dialogue.data.photoDecision });
      assert.equal(generated.status, 200);
    }
    const home = await call("/yuzukiSpeak", { ...dialogueInput, userText: "Скинь фото дома",
      world: { ...dialogueInput.world, photoWardrobe: { mode: "home", outfit: "" } },
    });
    assert.match(home.data.photoDecision.prompt, /red summer dress/u);
    assert.doesNotMatch(home.data.photoDecision.prompt, /SAME FIXED OFFICE OUTFIT/u);
    assert.equal(calls.filter(x => x.url.endsWith("/wavespeed-ai/z-image/turbo-lora")).length, 3);
  } finally { restore(); }
});


test("finished paid image can be recovered after a temporary CDN fetch failure", async () => {
  const calls = [];
  const restore = installMocks(calls, { failCdnOnce: true });
  try {
    const dialogue = await call("/yuzukiSpeak", dialogueInput);
    const start = await call("/yuzukiPhoto", { character: dialogueInput.character, decision: dialogue.data.photoDecision });
    const task = { taskId: start.data.providerTaskId, taskToken: start.data.taskToken };
    const status = await call("/yuzukiPhotoResult", task);
    assert.equal(status.data.ready, true);
    const broken = await call("/yuzukiPhotoAsset", task);
    assert.equal(broken.status, 502);
    assert.equal(broken.data.reason, "wavespeed-output-fetch-failed");
    const recovered = await callRaw("/yuzukiPhotoAsset", task);
    assert.equal(recovered.status, 200);
    assert.deepEqual(Buffer.from(await recovered.arrayBuffer()), finishedImage);
    assert.equal(calls.filter(c => c.url.endsWith("/wavespeed-ai/z-image/turbo-lora")).length, 1);
  } finally { restore(); }
});

test("image bytes require signed task authorization, not just task id", async () => {
  const calls = [];
  const restore = installMocks(calls);
  try {
    const forged = await call("/yuzukiPhotoAsset", { taskId: "mock-task-xyz", taskToken: "forged.token" });
    assert.equal(forged.status, 403);
    assert.equal(calls.filter(c => c.url.includes("/predictions/")).length, 0);
  } finally { restore(); }
});

test("reusing one signed photo approval does not submit a second paid prediction within one Worker isolate", async () => {
  const calls = [];
  const restore = installMocks(calls);
  try {
    const response = await call("/yuzukiSpeak", dialogueInput);
    assert.equal(response.data.photoDecision.shouldSendPhoto, true);
    const payload = { character: dialogueInput.character, decision: response.data.photoDecision };
    const first = await call("/yuzukiPhoto", payload);
    const second = await call("/yuzukiPhoto", payload);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.data.providerTaskId, second.data.providerTaskId);
    assert.equal(first.data.taskToken, second.data.taskToken);
    assert.equal(calls.filter(x => x.url.endsWith("/wavespeed-ai/z-image/turbo-lora")).length, 1);
  } finally { restore(); }
});

test("long existing conversation is not rejected by obsolete 76 KB Worker input cap", async () => {
  const calls = [];
  const restore = installMocks(calls);
  try {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 ? "character" : "user", text: `long message ${i}: ` + "x".repeat(2400),
    }));
    const payload = { ...dialogueInput, recentHistory: history, personality: "p".repeat(7000), memory: "m".repeat(12000) };
    assert.ok(JSON.stringify(payload).length > 76_000);
    const result = await call("/yuzukiSpeak", payload);
    assert.equal(result.status, 200);
    assert.equal(result.data.photoDecision?.shouldSendPhoto, true);
  } finally { restore(); }
});


test("GPT cannot claim an image was delivered when photoDecision refuses or trust gate blocks it", async () => {
  const calls = [];
  const restore = installMocks(calls, { modelRefuses: true, falsePhotoPromise: true });
  try {
    const result = await call("/yuzukiSpeak", { ...dialogueInput,
      character: { id: "anastasia_v1", name: "Анастасия", age: 30 },
      photoPolicy: { noRefusalMode: false } });
    assert.equal(result.data.photoDecision.shouldSendPhoto, false);
    assert.doesNotMatch(result.data.text, /вот кадр|держи фото/iu);
    assert.match(result.data.text, /Фото сейчас не подготовила/iu);
    assert.equal(calls.filter(x => x.url.includes("wavespeed-ai/z-image")).length, 0);
  } finally { restore(); }
});

test("Accepted photo without a prompt gets GPT repair before signing and starting WaveSpeed", async () => {
  const calls = [];
  const restore = installMocks(calls, { missingApprovedPrompt: true, falsePhotoPromise: true });
  try {
    const response = await call("/yuzukiSpeak", dialogueInput);
    assert.equal(response.data.photoDecision.shouldSendPhoto, true);
    assert.equal(response.data.photoDecision.prompt, finalChatPrompt);
    assert.doesNotMatch(response.data.text, /вот кадр|держи фото/iu);
    assert.equal(calls.filter(c => c.payload?.text?.format?.name === "alexandra_required_photo_prompt").length, 1);
    const start = await call("/yuzukiPhoto", { character: dialogueInput.character, decision: response.data.photoDecision });
    assert.equal(start.status, 200);
    assert.equal(start.data.pending, true);
  } finally { restore(); }
});


test("Worker distinguishes App Check rejection, invalid Firebase Auth and a temporary Auth outage", async () => {
  const calls = [];
  let restore = installMocks(calls);
  try {
    const badHeaders = { ...authHeader, "X-Firebase-AppCheck": "not-a-valid-jwt" };
    const invalidAppCheck = await worker.fetch(new Request(`${base}/yuzukiSpeak`, { method: "POST", headers: badHeaders,
      body: JSON.stringify(dialogueInput) }), env);
    assert.equal(invalidAppCheck.status, 401);
    assert.equal((await invalidAppCheck.json()).reason, "app-check-invalid");
  } finally { restore(); }
  restore = installMocks(calls, { authReject: true });
  try {
    const invalidAuth = await call("/yuzukiSpeak", dialogueInput);
    assert.equal(invalidAuth.status, 401);
    assert.equal(invalidAuth.data.reason, "firebase-auth-invalid");
  } finally { restore(); }
  restore = installMocks(calls, { authUnavailable: true });
  try {
    const outage = await call("/yuzukiSpeak", dialogueInput);
    assert.equal(outage.status, 503);
    assert.equal(outage.data.reason, "firebase-auth-upstream-unavailable");
  } finally { restore(); }
});


test("regression: 'А давай теперь ... фотку в полный рост' activates per-character photo option", async () => {
  const calls = [];
  const restore = installMocks(calls, {
    modelRefuses: true,
    photoReplyText: "Ну ты и запросы выдаёшь. Ладно, попробую снять нейтральное фото в полный рост.",
  });
  try {
    const input = {
      ...dialogueInput,
      userText: "А давай теперь голенькую фотку в полный рост)",
      recentHistory: [{ role: "character", text: "Недавно отправила тебе селфи." }],
      photoPolicy: { noRefusalMode: true },
    };
    const result = await call("/yuzukiSpeak", input);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    // The actual image is the non-explicit alternative produced by our mock GPT.
    assert.equal(result.data.photoFlow, "signed");
    assert.equal(result.data.photoDecision.shouldSendPhoto, true, JSON.stringify(result.data));
    assert.equal(result.data.photoDecision.intent.framing, "mirror");
    assert.match(result.data.photoDecision.authorization, /^[\w-]+\.[\w-]+$/u);
    const start = await call("/yuzukiPhoto", { character: input.character, decision: result.data.photoDecision });
    assert.equal(start.status, 200, JSON.stringify(start.data));
    assert.ok(start.data.providerTaskId);
    assert.equal(calls.filter(x => x.url.endsWith("wavespeed-ai/z-image/turbo-lora")).length, 1);
  } finally { restore(); }
});

test("regression: a textual photo offer without authorization is never shown as a pending photo", async () => {
  const calls = [];
  const restore = installMocks(calls, {
    modelRefuses: true,
    photoReplyText: "Ну ты и запросы выдаёшь. Ладно, попробую снять нейтральное фото в полный рост.",
  });
  try {
    const result = await call("/yuzukiSpeak", {
      ...dialogueInput,
      userText: "А давай теперь фотку в полный рост",
      character: { id: "anastasia_v1", name: "Анастасия", age: 30 },
      photoPolicy: { noRefusalMode: false },
    });
    assert.equal(result.data.photoFlow, "not-approved");
    assert.equal(result.data.photoDecision.shouldSendPhoto, false);
    assert.doesNotMatch(result.data.text, /попробую снять|вот кадр|отправлю фото/iu);
    assert.match(result.data.text, /Фото сейчас не подготовила/iu);
    assert.equal(calls.filter(x => x.url.endsWith("wavespeed-ai/z-image/turbo-lora")).length, 0);
  } finally { restore(); }
});

test("regression: short photo follow-ups work while questions about photo status do not trigger generation", async () => {
  const calls = [];
  const restore = installMocks(calls, { modelRefuses: true });
  try {
    for (const userText of ["Давай селфи", "А теперь в полный рост", "Еще одну фотку", "А в зеркале?"]) {
      const result = await call("/yuzukiSpeak", { ...dialogueInput, userText,
        recentHistory: [{ role: "character", text: "Я сейчас попробую сделать селфи." }],
        photoPolicy: { noRefusalMode: true },
      });
      assert.equal(result.data.photoFlow, "signed", userText);
      assert.equal(result.data.photoDecision.shouldSendPhoto, true, userText);
    }
    for (const userText of ["Почему ты не прислала фото?", "Не надо отправлять фото", "Как тебе моя фотка?"]) {
      const result = await call("/yuzukiSpeak", { ...dialogueInput, userText,
        recentHistory: [{ role: "character", text: "Я сейчас попробую сделать селфи." }],
        photoPolicy: { noRefusalMode: true },
      });
      assert.equal(result.data.photoFlow, "not-requested", userText);
    }
  } finally { restore(); }
});

test("Worker health and CORS expose actual deployment version for stale Worker detection", async () => {
  const response = await worker.fetch(new Request(`${base}/health`, { headers: { Origin: origin } }), env);
  const status = await response.json();
  assert.equal(status.version, "0.21.19");
  assert.equal(response.headers.get("X-Game2-Worker-Version"), "0.21.19");
  assert.match(response.headers.get("Access-Control-Expose-Headers"), /X-Game2-Worker-Version/u);
});

test("Anastasia: distinct GPT personality, independent signed LoRA and no cross-character billing", async () => {
  const calls = [];
  const restore = installMocks(calls);
  try {
    const person = { id: "anastasia_v1", name: "Анастасия", age: 30 };
    const dialogue = await call("/yuzukiSpeak", { ...dialogueInput, character: person,
      userText: "Настя, сделай селфи дома", relationship: { trust: 0.6, closeness: 0.6 },
      world: { currentActivity: "relaxing", currentLocation: "living_room", photoWardrobe: { mode: "home", outfit: "" } },
      photoPolicy: { noRefusalMode: false },
    });
    assert.equal(dialogue.status, 200, JSON.stringify(dialogue.data));
    assert.equal(dialogue.data.photoDecision.shouldSendPhoto, true);
    assert.match(dialogue.data.photoDecision.prompt, /^g2girl03, /u);
    const gptCall = calls.find(x => x.payload?.text?.format?.name === "alexandra_turn");
    assert.match(gptCall.payload.instructions, /Ты — Анастасия, взрослая женщина 30 лет/u);
    assert.doesNotMatch(gptCall.payload.instructions, /Ты — Александра/u);
    const stolen = await call("/yuzukiPhoto", { character: dialogueInput.character,
      decision: dialogue.data.photoDecision });
    assert.equal(stolen.status, 403);
    assert.equal(calls.filter(x => x.url.endsWith("/wavespeed-ai/z-image/turbo-lora")).length, 0);
    const start = await call("/yuzukiPhoto", { character: person, decision: dialogue.data.photoDecision });
    assert.equal(start.status, 200, JSON.stringify(start.data));
    assert.equal(start.data.pending, true);
    const submit = calls.find(x => x.url.endsWith("/wavespeed-ai/z-image/turbo-lora"));
    assert.match(submit.payload.loras[0].path, /3818cb28-8c31-44bd-ac6a-40b598a26bad/u);
    assert.equal(submit.payload.loras[0].scale, 0.85);
    assert.match(submit.payload.prompt, /^g2girl03, /u);
    assert.doesNotMatch(submit.payload.prompt, /child|kid|minor|ребёнок/iu);
  } finally { restore(); }
});

test("Anastasia early-stage caution is separate from later photo access", async () => {
  const calls = [];
  const restore = installMocks(calls, { modelRefuses: true });
  try {
    const character = { id: "anastasia_v1", name: "Анастасия", age: 30 };
    const early = await call("/yuzukiSpeak", { ...dialogueInput, character,
      relationship: { trust: 0, closeness: 0 }, photoPolicy: { noRefusalMode: false } });
    assert.equal(early.data.photoDecision.shouldSendPhoto, false);
    const later = await call("/yuzukiSpeak", { ...dialogueInput, character,
      relationship: { trust: 0.7, closeness: 0.65 }, photoPolicy: { noRefusalMode: false } });
    assert.equal(later.data.photoDecision.shouldSendPhoto, true);
    assert.match(later.data.photoDecision.prompt, /^g2girl03, /u);
  } finally { restore(); }
});
