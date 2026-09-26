import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const registry = read("src/character/character-registry.ts");
const store = read("src/app/store.ts");
const runtime = read("src/engine/runtime.ts");
const app = read("src/App.tsx");
const chat = read("src/ui/ChatScreen.tsx");
const worker = read("cloudflare/worker.js");

assert.match(registry, /characterProfiles/);
assert.match(registry, /mika_v1/);
assert.match(registry, /rin_v1/);
assert.match(store, /activeCharacterId/);
assert.match(store, /selectCharacter:/);
assert.match(store, /subscribeCharacterLiveSync\(characterId/);
assert.match(runtime, /getCompanionRepository\(characterId/);
assert.match(runtime, /character:\s*\{ id: profile\.id, name: profile\.core\.name, age: profile\.core\.age \}/);
assert.match(app, /InboxScreen/);
assert.match(app, /PeopleScreen/);
assert.doesNotMatch(app, /CharacterStage/);
assert.match(chat, /message\.kind === "image"/);
assert.match(worker, /CURRENT CHARACTER/);
assert.match(worker, /raw\.character\?\.name/);

console.log("PASS social architecture foundation");
