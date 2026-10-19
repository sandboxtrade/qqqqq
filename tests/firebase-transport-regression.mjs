import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
const transpiled = ts.transpileModule(source("src/storage/firestore-operation-policy.ts"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const policy = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

test("writes and mixed read/repair transactions are never abandoned by repository timeout", () => {
  for (const operation of ["appendEvent", "commitTurn", "dismissPendingTurn", "updateEditableContext", "resetConversationAndMemory", "unknownNewWriteMethod"]) {
    assert.equal(policy.mayTimeOutFirestoreOperation(operation), false, operation);
  }
  for (const operation of ["getEvent", "loadRuntimeState", "listConversationEvents", "loadEditableContext", "loadIntimacyState"]) {
    assert.equal(policy.mayTimeOutFirestoreOperation(operation), true, operation);
  }
  assert.ok(policy.FIRESTORE_READ_TIMEOUT_MS >= 25_000);
  const repo = source("src/storage/repository-factory.ts");
  assert.doesNotMatch(repo, /: 8000|\? 45000\s*:\s*8000/u);
  assert.match(repo, /mayTimeOutFirestoreOperation\(operation\)/u);
});

test("failed Firebase operation preserves the original error code and operation", () => {
  const error = Object.assign(new Error("backend down"), { code: "unavailable" });
  const annotated = policy.annotateFirestoreOperation(error, "commitTurn");
  assert.equal(annotated.code, "unavailable");
  assert.match(annotated.message, /Firestore:commitTurn/u);
});

test("transient Firebase recovery does not bootstrap the entire character", () => {
  const store = source("src/app/store.ts");
  assert.match(store, /if \(isRecoverableTurnSyncError\(error\)\) \{\s*\/\/ A genuine revision conflict/u);
  assert.match(store, /Reuse the same user-event ID/u);
  assert.match(store, /version: ENGINE_VERSION/u);
});

test("state/world skew recovery is read-only, never silently bumps revisions", () => {
  const repository = source("src/storage/repositories/firestore-repository.ts");
  const method = repository.slice(repository.indexOf("  async loadRuntimeState()"), repository.indexOf("  async loadSnapshot()"));
  assert.match(method, /for \(let attempt = 0; attempt < 3/u);
  assert.doesNotMatch(method, /runTransaction|tx\.set|repairedRevision/u);
  assert.match(method, /state-world-conflict/u);
  assert.equal(policy.mayTimeOutFirestoreOperation("loadRuntimeState"), true);
});

test("live synchronization batches catch-up queries and coalesces revisions", () => {
  const sync = source("src/storage/live-sync.ts");
  const store = source("src/app/store.ts");
  assert.match(sync, /catchUpTimer = setTimeout/u);
  assert.match(sync, /clearTimeout\(catchUpTimer\)/u);
  assert.match(store, /pendingLiveRevision <= state\.runtime\.revision \|\| liveRefresh/u);
  assert.match(store, /const requestedRevision = pendingLiveRevision/u);
  assert.doesNotMatch(store.slice(store.indexOf("const refreshRuntime"), store.indexOf("flushLiveRevision =")), /liveRefresh\?\.abort\(\)/u);
  assert.match(store, /25_000/u);
});

test("Firebase auth hydration waits long enough for mobile webview", () => {
  const auth = source("src/storage/auth.ts");
  assert.match(auth, /timeoutMs = 15000/u);
});

test("Firebase errors are visible in mobile settings without exposing conversation data", () => {
  const telemetry = source("src/storage/firebase-diagnostics.ts");
  const repository = source("src/storage/repository-factory.ts");
  const settings = source("src/ui/SettingsScreen.tsx");
  const appCheck = source("src/storage/firebase.ts");
  assert.match(telemetry, /recordFirebaseFailure/u);
  assert.match(telemetry, /lastFirebaseFailure/u);
  assert.doesNotMatch(telemetry, /\blocalStorage\b|\bsetDoc\(/u);
  assert.match(repository, /recordFirebaseFailure\(operation, code, elapsedMs\)/u);
  assert.match(appCheck, /recordFirebaseFailure\("appCheck"/u);
  assert.match(settings, /Последний сбой Firebase/u);
  assert.match(settings, /firebaseFailure\.operation/u);
});

test("pending-turn recovery loads user/reply pairs in 30-document batches", () => {
  const repository = source("src/storage/repositories/firestore-repository.ts");
  const section = repository.slice(repository.indexOf("  async listPendingTurns("), repository.indexOf("  async dismissPendingTurn("));
  assert.match(section, /if \(!markers\.length\) return \[\]/u);
  assert.match(section, /offset \+= 30/u);
  assert.match(section, /where\(documentId\(\), "in", batch\)/u);
  assert.match(section, /byId\.has\(`reply_\$\{marker\.messageId\}`\)/u);
  assert.doesNotMatch(section, /markers\.map\(async/u, "never start hundreds of individual getDoc requests");
});

test("mobile Firestore auto-detects blocked streaming transport", () => {
  const firebase = source("src/storage/firebase.ts");
  assert.match(firebase, /initializeFirestore\(firebaseApp, \{/u);
  assert.match(firebase, /experimentalAutoDetectLongPolling: true/u);
});

test("Worker guards GPT latency and differentiates upstream failure from invalid JSON", () => {
  const worker = source("cloudflare/worker.js");
  assert.match(worker, /function openAIResponse\(env, body, maxWaitMs\)/u);
  assert.match(worker, /signal: controller\.signal/u);
  assert.match(worker, /"openai-timeout"/u);
  assert.match(worker, /"openai-invalid-response"/u);
});
