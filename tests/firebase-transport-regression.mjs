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
  for (const operation of ["appendEvent", "commitTurn", "dismissPendingTurn", "loadRuntimeState", "updateEditableContext", "resetConversationAndMemory", "unknownNewWriteMethod"]) {
    assert.equal(policy.mayTimeOutFirestoreOperation(operation), false, operation);
  }
  for (const operation of ["getEvent", "listConversationEvents", "loadEditableContext", "loadIntimacyState"]) {
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
  assert.match(store, /"0\.21\.9"/u);
});
