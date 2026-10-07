import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks, stripTypeScriptTypes } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !specifier.match(/\.[cm]?[jt]sx?$/u)) {
      try { return nextResolve(`${specifier}.ts`, context); } catch {}
      try { return nextResolve(`${specifier}.tsx`, context); } catch {}
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".ts") || url.endsWith(".tsx")) {
      return { source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "transform" }), format: "module", shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { characterProfiles } = await import("../src/character/character-registry.ts");
const registry = readFileSync(new URL("../src/character/character-registry.ts", import.meta.url), "utf8");
const world = readFileSync(new URL("../src/world/world.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");

const diana = characterProfiles.find((profile) => profile.id === "diana_v1");
assert.ok(diana, "Diana must be registered");
assert.equal(diana.core.name, "Диана");
assert.equal(diana.core.age, 35);
assert.equal(diana.occupation, "владелица fashion-showroom");
assert.ok(diana.defaultPersonality.length >= 1800, "Diana personality must be substantial");
assert.ok(diana.voiceProfile?.styleGuide?.length >= 1800, "Diana voice style must be substantial");
assert.ok((diana.initialIntimacy?.initiativeDrive ?? 0) >= 0.88, "Diana should be highly initiative-driven");
assert.ok((diana.initialIntimacy?.interest ?? 0) >= 0.8, "Diana should start with strong social interest");
assert.match(diana.defaultPersonality, /двоих детей/);
assert.match(diana.defaultPersonality, /богатым мужчиной/);
assert.match(diana.voiceProfile.styleGuide, /флиртует первой/);
assert.match(registry, /profile\.diana\.avatar/);
assert.match(world, /diana_v1/);
assert.match(worker, /diana_v1:\s*"diana"/);

for (const file of ["avatar.jpg", "01.jpg", "02.jpg", "03.jpg", "identity-sheet.jpg"]) {
  const absolute = new URL(`../public/assets/profiles/diana/${file}`, import.meta.url);
  assert.ok(existsSync(absolute), `missing Diana asset: ${file}`);
  assert.ok(statSync(absolute).size > 20_000, `Diana asset looks empty: ${file}`);
}

console.log("PASS Diana profile, strong initiative, world routine, worker routing and assets");
