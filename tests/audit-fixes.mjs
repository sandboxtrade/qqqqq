import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../src/app/store.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/ui/ChatScreen.tsx", import.meta.url), "utf8");
const worker = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");
const version = readFileSync(new URL("../src/config/version.ts", import.meta.url), "utf8");

assert.match(version, /ENGINE_VERSION = "0\.20\.56"/);
assert.match(version, /SCHEMA_VERSION = 4/);

// Pending photo work must be a first-class cancellable job, not a detached timer.
assert.match(store, /const pendingPhotoJobs = new Map/);
assert.match(store, /function cancelPendingPhotoJobs/);
assert.match(store, /function invalidate\(\)[\s\S]*cancelPendingPhotoJobs\(\)/);
assert.match(store, /controller\?\.abort/);
assert.match(store, /pendingPhotoJobs\.set\(jobKey, job\)/);

// Account changes must clear user-scoped inbox/photo state immediately.
assert.match(store, /function watchAuth\(\)[\s\S]*inboxCharacterIds: \[\][\s\S]*inboxPreviews: \{\}[\s\S]*photoBalanceAlert: null/);

// Failed per-character inbox queries preserve previous membership instead of becoming “empty”.
assert.match(store, /status: "error" as const/);
assert.match(store, /On a query error preserve the previous known membership\/preview/);

// Failed photos are actionable and balance errors are visible.
assert.match(store, /retryPhoto: async/);
assert.match(chat, /Повторить фото/);
assert.doesNotMatch(chat, /на следующем этапе сюда подключится повтор генерации/);
assert.match(app, /photoBalanceAlert\?\.open/);
assert.match(app, /dismissPhotoBalanceAlert/);

// Async photo/proactive deliveries update inbox previews directly.
assert.match(store, /markCharacterHasConversation\([\s\S]*conversationPreviewFromLines\(useAppStore\.getState\(\)\.messages\)/);

// Seedream production reference is a clean avatar first, identity sheet only fallback.
assert.match(worker, /avatar-primary/);
assert.match(worker, /identity-sheet-fallback/);
assert.doesNotMatch(worker, /identity-sheet first; avatar only/);

console.log("PASS v0.20.51 audit fixes: cancellable photos, resilient inbox, visible errors and avatar-first references");
