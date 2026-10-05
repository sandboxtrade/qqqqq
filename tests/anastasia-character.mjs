import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const registry = readFileSync(new URL("../src/character/character-registry.ts", import.meta.url), "utf8");
const world = readFileSync(new URL("../src/world/world.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");

assert.match(registry, /anastasiaCore/);
assert.match(registry, /handle: "@anastasia"/);
assert.match(registry, /occupation: "бренд-консультант"/);
assert.match(registry, /Анастасия — вымышленная взрослая женщина 40 лет/);
assert.match(registry, /ANASTASIA_VOICE_STYLE/);
assert.match(world, /anastasia_v1/);
assert.match(worker, /anastasia_v1:\s*"anastasia"/);

for (const file of ["avatar.jpg", "01.jpg", "02.jpg", "03.jpg", "identity-sheet.jpg"]) {
  const absolute = new URL(`../public/assets/profiles/anastasia/${file}`, import.meta.url);
  assert.ok(existsSync(absolute), `missing Anastasia asset: ${file}`);
  assert.ok(statSync(absolute).size > 20_000, `Anastasia asset looks empty: ${file}`);
}

console.log("PASS Anastasia profile, worker routing and photo assets");
