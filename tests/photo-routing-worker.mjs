import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "yuzuki-photo-worker-"));
const workerPath = join(dir, "worker-photo-test.mjs");
const source = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8")
  + "\nexport { submitWaveSpeedImage, readWaveSpeedImage, isWaveSpeedCreditFailure, fetchCachedReference };\n";
writeFileSync(workerPath, source);

const mod = await import(`${pathToFileURL(workerPath).href}?v=${Date.now()}`);
const { submitWaveSpeedImage, readWaveSpeedImage, isWaveSpeedCreditFailure, fetchCachedReference } = mod;
const originalFetch = globalThis.fetch;

try {
  assert.equal(isWaveSpeedCreditFailure("A top-up is required. Please top up your account to continue."), true);
  assert.equal(isWaveSpeedCreditFailure("ordinary generation failure"), false);

  const env = { WAVESPEED_API_KEY: "route-k1", WAVESPEED_API_KEY_2: "route-k2", WAVESPEED_API_KEY_3: "route-k3" };
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), auth: options.headers?.Authorization, body: options.body });
    if (String(url).includes("/minimax-h3/image-edit")) {
      if (options.headers.Authorization === "Bearer route-k1") {
        return new Response(JSON.stringify({ message: "top up required" }), { status: 402, headers: { "content-type": "application/json" } });
      }
      if (options.headers.Authorization === "Bearer route-k2") {
        return new Response(JSON.stringify({ data: { id: "mini-task-k2" } }), { status: 200, headers: { "content-type": "application/json" } });
      }
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const started = await submitWaveSpeedImage(env, "prompt", ["https://example.com/id.jpg"], "wavespeed-ai/minimax-h3/image-edit");
  assert.equal(started.ok, true);
  assert.equal(started.taskId, "mini-task-k2");
  assert.equal(started.credentialAttempt, 2);
  assert.deepEqual(calls.map((call) => call.auth), ["Bearer route-k1", "Bearer route-k2"]);

  calls.length = 0;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), auth: options.headers?.Authorization });
    if (String(url).includes("/predictions/mini-task-k2/result")) {
      if (options.headers.Authorization !== "Bearer route-k2") {
        return new Response(JSON.stringify({ message: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ data: { status: "processing" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const pending = await readWaveSpeedImage(env, "mini-task-k2", "wavespeed-ai/minimax-h3/image-edit", { preferredCredentialAttempt: 2 });
  assert.equal(pending.pending, true);
  assert.equal(pending.credentialAttempt, 2);
  assert.equal(calls[0].auth, "Bearer route-k2");

  calls.length = 0;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), auth: options.headers?.Authorization });
    if (String(url).includes("/predictions/mini-task-k2/result")) {
      if (options.headers.Authorization === "Bearer route-k2") {
        return new Response(JSON.stringify({ data: { status: "failed", error: "A top-up is required. Please top up your account to continue." } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const creditFailure = await readWaveSpeedImage(env, "mini-task-k2", "wavespeed-ai/minimax-h3/image-edit", { preferredCredentialAttempt: 2 });
  assert.equal(creditFailure.credentialFailure, true);
  assert.equal(creditFailure.retryWithNextKey, true);
  assert.equal(creditFailure.credentialAttempt, 2);

  calls.length = 0;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), auth: options.headers?.Authorization, body: options.body });
    if (String(url).includes("/minimax-h3/image-edit") && options.headers.Authorization === "Bearer route-k3") {
      return new Response(JSON.stringify({ data: { id: "mini-task-k3" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected retry key ${options.headers?.Authorization}`);
  };
  const nextKey = await submitWaveSpeedImage(env, "prompt", ["https://example.com/id.jpg"], "wavespeed-ai/minimax-h3/image-edit", { startCredentialIndex: 2 });
  assert.equal(nextKey.ok, true);
  assert.equal(nextKey.credentialAttempt, 3);
  assert.equal(calls[0].auth, "Bearer route-k3");

  calls.length = 0;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), auth: options.headers?.Authorization, body: options.body });
    if (String(url).includes("/alibaba/wan-2.6/image-edit")) {
      const payload = JSON.parse(options.body);
      assert.deepEqual(payload.images, ["https://example.com/identity-sheet.jpg"]);
      assert.equal(payload.enable_prompt_expansion, false);
      return new Response(JSON.stringify({ data: { id: "wan-task" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const wan = await submitWaveSpeedImage({ WAVESPEED_API_KEY: "fresh-wan-key" }, "private photo", ["https://example.com/identity-sheet.jpg"], "alibaba/wan-2.6/image-edit");
  assert.equal(wan.ok, true);
  assert.equal(wan.model, "alibaba/wan-2.6/image-edit");

  calls.length = 0;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), auth: options.headers?.Authorization });
    if (String(url).includes("/predictions/done-task/result")) {
      return new Response(JSON.stringify({ data: { status: "completed", outputs: ["https://cdn.example/result.webp"] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url) === "https://cdn.example/result.webp") {
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/webp", "content-length": "4" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const completed = await readWaveSpeedImage({ WAVESPEED_API_KEY: "result-key" }, "done-task", "alibaba/wan-2.6/image-edit", { preferredCredentialAttempt: 1 });
  assert.equal(completed.ok, true);
  assert.match(completed.dataUrl, /^data:image\/webp;base64,/);

  globalThis.fetch = async () => new Response("not an image", { status: 200, headers: { "content-type": "text/plain" } });
  assert.equal(await fetchCachedReference("https://example.com/not-image-reference"), null);

  console.log("PASS dynamic photo worker routing, multi-key, result and reference checks");
} finally {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
}
