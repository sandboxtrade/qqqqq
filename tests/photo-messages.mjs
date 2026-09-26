import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../src/engine/runtime.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../src/ai/cloud-language.ts", import.meta.url), "utf8");
const photoClient = readFileSync(new URL("../src/ai/cloud-photo.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/ui/ChatScreen.tsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../src/character/character-registry.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../src/app/store.ts", import.meta.url), "utf8");
const exporter = readFileSync(new URL("../src/chat/conversation-export-service.ts", import.meta.url), "utf8");
const localPhotoCache = readFileSync(new URL("../src/storage/local-photo-cache.ts", import.meta.url), "utf8");

assert.match(client, /export interface CloudPhotoDecision/);
assert.match(client, /PhotoDecisionReason = "none" \| "user_requested" \| "self_initiated"/);
assert.match(photoClient, /export async function generateCloudPhoto/);
assert.match(photoClient, /yuzukiPhoto/);
assert.match(worker, /const IMAGE_MODEL = "gpt-image-2.5-flare"/);
assert.match(worker, /url\.pathname === "\/yuzukiPhoto"/);
assert.match(worker, /buildPhotoPrompt/);
assert.match(worker, /output_format: "webp"/);
assert.match(runtime, /persistGeneratedPhotoMessage/);
assert.match(runtime, /localPhotoId/);
assert.match(runtime, /saveLocalPhoto/);
assert.match(store, /queueGeneratedPhotoDelivery/);
assert.match(store, /hydrateMissingPhotoMessages/);
assert.match(localPhotoCache, /indexedDB/);
assert.match(chat, /готовит фото/);
assert.match(chat, /photo-failed/);
assert.match(registry, /export interface CharacterVisualProfile/);
assert.match(registry, /referenceAssetIds/);
assert.match(registry, /defaultPhotoStyle/);
assert.match(exporter, /\[Отправила фотографию\]/);

console.log("photo message local generation checks passed.");
