import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const firebase = read("src/storage/firebase.ts");
const store = read("src/app/store.ts");
const photo = read("src/ai/cloud-photo.ts");
const runtime = read("src/engine/runtime.ts");

assert.match(firebase, /\| "throttled"/);
assert.match(firebase, /appCheck\/throttled/);
assert.match(firebase, /appCheck\/initial-throttle/);
assert.match(firebase, /app-check-throttled/);
assert.match(firebase, /app-check-rejected/);
assert.match(firebase, /isTokenAutoRefreshEnabled:\s*false/);
assert.match(firebase, /setTokenAutoRefreshEnabled\(appCheck, true\)/);
assert.doesNotMatch(store, /warmAppCheck\s*\(/);
assert.doesNotMatch(store, /verifyAppCheck,/);
assert.match(photo, /isAppCheckAttestationError\(error\)/);
assert.match(runtime, /Firebase App Check отклонил проверку сайта \(403\)/);
console.log("PASS App Check 403/throttle diagnostics and retry hygiene");
