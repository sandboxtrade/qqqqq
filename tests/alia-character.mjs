import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const registry = read("src/character/character-registry.ts");
const world = read("src/world/world.ts");
const worker = read("cloudflare/worker.js");
const version = read("src/config/version.ts");

assert.match(registry, /const aliaCore = makeCore\(\s*"alia_v1",\s*"Алия",\s*33,/s);
assert.match(registry, /handle:\s*"@alia"/);
assert.match(registry, /locationLabel:\s*"Алматы"/);
assert.match(registry, /occupation:\s*"дизайнер интерьеров"/);
assert.match(registry, /voiceProfile:\s*\{ styleGuide: ALIA_VOICE_STYLE \}/);
assert.match(registry, /referenceAssetIds:\s*\["profile\.alia\.avatar"\]/);
assert.match(registry, /avatarUrl:\s*"\.\/assets\/profiles\/alia\/avatar\.jpg"/);
assert.match(world, /alia_v1:\s*\{[\s\S]*?personal_project:/);
assert.match(world, /alia_v1:\s*\[[\s\S]*?activities:\s*\["sleeping"\]/);
assert.match(worker, /alia_v1:\s*"alia"/);
assert.match(version, /ENGINE_VERSION = "0\.20\.56"/);

const aliaAssetsDir = path.join(root, "public/assets/profiles/alia");
if (existsSync(path.join(aliaAssetsDir, "avatar.jpg"))) {
  for (const name of ["avatar.jpg", "identity-sheet.jpg", "01.jpg", "02.jpg", "03.jpg"]) {
    const file = path.join(aliaAssetsDir, name);
    assert.equal(existsSync(file), true, `${name} missing`);
    const bytes = readFileSync(file);
    assert.ok(bytes.length > 20_000, `${name} unexpectedly small`);
    assert.equal(bytes[0], 0xff, `${name} is not JPEG`);
    assert.equal(bytes[1], 0xd8, `${name} is not JPEG`);
  }
}

for (const name of ["avatar.jpg", "01.jpg", "02.jpg", "03.jpg"]) {
  const file = path.join(root, "public/assets/profiles/vika", name);
  assert.equal(existsSync(file), true, `vika/${name} missing`);
  const bytes = readFileSync(file);
  assert.ok(bytes.length > 20_000, `vika/${name} unexpectedly small`);
  assert.equal(bytes[0], 0xff, `vika/${name} is not JPEG`);
  assert.equal(bytes[1], 0xd8, `vika/${name} is not JPEG`);
}

console.log("PASS Alia/Vika character profile coverage, world routine, worker mapping and image assets");
