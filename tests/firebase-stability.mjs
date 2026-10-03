import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const firebase = readFileSync(new URL("../src/storage/firebase.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../src/app/store.ts", import.meta.url), "utf8");
const language = readFileSync(new URL("../src/ai/cloud-language.ts", import.meta.url), "utf8");
const photo = readFileSync(new URL("../src/ai/cloud-photo.ts", import.meta.url), "utf8");

assert.match(firebase, /pendingAppCheckToken/);
assert.match(firebase, /getFirebaseAppCheckToken\(false\)/);
assert.match(firebase, /APP_CHECK_READY_TIMEOUT_MS = 18_000/);
assert.match(store, /phase: "Проверяем Firebase…"/);
assert.match(store, /await verifyAppCheck\(\)/);
assert.match(language, /TOKEN_PREP_TIMEOUT_MS = 18_000/);
assert.match(language, /forceAppCheck/);
assert.match(language, /forceAuth/);
assert.match(photo, /TOKEN_TIMEOUT_MS = 18_000/);
assert.match(photo, /forceAuth: true/);
assert.doesNotMatch(photo, /acquireTokens\(auth\.currentUser, true/);

console.log("PASS Firebase/App Check startup and token stability guards");
