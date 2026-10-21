import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import * as ts from "typescript";

const source = readFileSync(new URL("../src/world/world.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
const module = { exports };
// Resolve only the static domain import; these tests never invoke emotion mutations.
const load = new Function("require", "module", "exports", compiled);
load(() => ({ applyEmotionDelta: () => { throw new Error("unexpected emotion call"); } }), module, exports);
const { resolvePhotoWardrobe } = module.exports;

const atMoscowHour = (hour) => new Date(`2026-10-19T${String(hour).padStart(2,"0")}:00:00+03:00`).valueOf();

test("Alexandra keeps the identical office outfit for each image during the shift", () => {
  const first = resolvePhotoWardrobe(atMoscowHour(10), "Europe/Moscow", "alexandra_v1");
  const second = resolvePhotoWardrobe(atMoscowHour(12), "Europe/Moscow", "alexandra_v1");
  const third = resolvePhotoWardrobe(atMoscowHour(16), "Europe/Moscow", "alexandra_v1");
  assert.equal(first.mode, "office");
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
  assert.match(first.outfit, /white office blouse/u);
  assert.match(first.outfit, /black fitted office pencil skirt/u);
  assert.match(first.outfit, /black high heels/u);
});

test("home outfit stays flexible after office hours", () => {
  const home = resolvePhotoWardrobe(atMoscowHour(21), "Europe/Moscow", "alexandra_v1");
  assert.equal(home.mode, "home");
  assert.equal(home.outfit, "");
});
