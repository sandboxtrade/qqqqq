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
assert.match(registry, /aiko_v1/);
assert.match(registry, /hina_v1/);
assert.match(registry, /sasha_v1/);
assert.match(registry, /kira_v1/);
assert.match(registry, /valeria_v1/);
assert.match(registry, /mei_v1/);
assert.match(registry, /alina_v1/);
assert.match(registry, /lea_v1/);
assert.match(registry, /sofia_v1/);
assert.match(registry, /alia_v1/);
assert.match(registry, /eva_v1/);
assert.match(registry, /nora_v1/);
assert.match(registry, /appearanceLabel/);
assert.match(registry, /assets\/profiles\/mika\/avatar\.jpg/);
assert.match(registry, /assets\/profiles\/aiko\/avatar\.jpg/);
assert.match(registry, /assets\/profiles\/sasha\/avatar\.jpg/);
assert.match(registry, /assets\/profiles\/kira\/avatar\.jpg/);
assert.match(registry, /assets\/profiles\/valeria\/avatar\.jpg/);
assert.match(registry, /assets\/profiles\/mei\/avatar\.jpg/);
assert.match(registry, /assets\/profiles\/alina\/avatar\.jpg/);
assert.match(registry, /assets\/profiles\/alia\/avatar\.jpg/);
assert.match(registry, /initialIntimacy/);
for (const voiceName of [
  "YUZUKI_VOICE_STYLE", "MIKA_VOICE_STYLE", "RIN_VOICE_STYLE", "AIKO_VOICE_STYLE", "HINA_VOICE_STYLE", "SASHA_VOICE_STYLE",
  "KIRA_VOICE_STYLE", "VALERIA_VOICE_STYLE", "MEI_VOICE_STYLE", "ALINA_VOICE_STYLE", "LEA_VOICE_STYLE", "SOFIA_VOICE_STYLE", "ALIA_VOICE_STYLE", "EVA_VOICE_STYLE", "NORA_VOICE_STYLE",
]) assert.match(registry, new RegExp(`voiceProfile: \{ styleGuide: ${voiceName} \}`));
for (const name of ["Yuzuki", "Mika", "Rin", "Aiko", "Hina", "Саша", "Kira", "Valeria", "Mei", "Alina", "Lea", "Sofia", "Алия", "Eva", "Nora"])
  assert.match(registry, new RegExp(`expressionGuidance: "${name}`));
assert.match(store, /activeCharacterId/);
assert.match(store, /selectCharacter:/);
assert.match(store, /subscribeCharacterLiveSync\(characterId/);
assert.match(runtime, /getCompanionRepository\(characterId/);
assert.match(runtime, /character:\s*\{ id: profile\.id, name: profile\.core\.name, age: profile\.core\.age \}/);
assert.match(app, /InboxScreen/);
assert.match(app, /PeopleScreen/);
assert.match(app, /openCharacterSettings/);
assert.match(app, /onSettings=/);
assert.doesNotMatch(app, /<span>Настройки<\/span>/);
assert.doesNotMatch(app, /CharacterStage/);
assert.match(chat, /message\.kind === "image"/);
assert.match(worker, /CURRENT CHARACTER/);
assert.match(worker, /raw\.character\?\.name/);
assert.match(worker, /alia_v1:\s*"alia"/);
assert.match(worker, /occupied\/personal_project\/reading\/music\/cooking\/errands/);
assert.match(worker, /reconcilePhotoSendMessages/);
assert.match(worker, /Prefer GPT\'s own generated caption/);

console.log("PASS social architecture foundation");
