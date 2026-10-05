import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
      return {
        source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), { mode: "transform" }),
        format: "module",
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { characterProfiles } = await import("../src/character/character-registry.ts");
const { createInitialWorldState, describeWorldActivityDetail, markUserInteraction } = await import("../src/world/world.ts");

assert.ok(characterProfiles.length >= 17, "all social characters must remain registered");

const personalityTexts = [];
const voiceTexts = [];
for (const profile of characterProfiles) {
  assert.ok(profile.defaultPersonality.length >= 800, `${profile.id}: personality is too thin`);
  assert.ok(profile.voiceProfile?.styleGuide?.length >= 1000, `${profile.id}: voice style is too thin`);
  assert.ok(profile.occupation?.trim(), `${profile.id}: occupation missing`);
  assert.ok(profile.locationLabel?.trim(), `${profile.id}: location missing`);
  assert.ok(profile.interests.length >= 4, `${profile.id}: interests too sparse`);
  assert.ok(profile.core.values.length >= 3, `${profile.id}: values too sparse`);
  assert.ok(profile.core.preferences.length >= 3, `${profile.id}: preferences too sparse`);
  assert.ok(profile.core.dislikes.length >= 3, `${profile.id}: dislikes too sparse`);
  personalityTexts.push(profile.defaultPersonality.trim());
  voiceTexts.push(profile.voiceProfile.styleGuide.trim());
}
assert.equal(new Set(personalityTexts).size, personalityTexts.length, "character personalities must be distinct");
assert.equal(new Set(voiceTexts).size, voiceTexts.length, "character voices must be distinct");

const wordSet = (value) => new Set(value.toLowerCase().replace(/[^a-zа-яё0-9]+/giu, " ").split(/\s+/u).filter((word) => word.length > 4));
let maxPersonalitySimilarity = 0;
for (let left = 0; left < characterProfiles.length; left += 1) {
  for (let right = left + 1; right < characterProfiles.length; right += 1) {
    const a = wordSet(characterProfiles[left].defaultPersonality);
    const b = wordSet(characterProfiles[right].defaultPersonality);
    const overlap = [...a].filter((word) => b.has(word)).length;
    const union = new Set([...a, ...b]).size || 1;
    maxPersonalitySimilarity = Math.max(maxPersonalitySimilarity, overlap / union);
  }
}
assert.ok(maxPersonalitySimilarity < 0.25, `personalities are too lexically similar: ${maxPersonalitySimilarity}`);

const stamp = Date.UTC(2026, 9, 3, 16, 0, 0);
const readingDetails = [
  describeWorldActivityDetail("reading", stamp, "yuzuki_v1"),
  describeWorldActivityDetail("reading", stamp, "rin_v1"),
  describeWorldActivityDetail("reading", stamp, "hina_v1"),
];
assert.ok(new Set(readingDetails).size >= 2, "character-specific activity details should not collapse to one line");

const outside = {
  ...createInitialWorldState(stamp, "UTC", "mika_v1"),
  currentLocation: "outside",
  currentActivity: "walk",
  availability: "free",
  isAwake: true,
};
const afterMessage = markUserInteraction(outside, stamp + 1_000, { engaged: true });
assert.equal(afterMessage.currentLocation, "outside", "a chat message must not teleport the character home");
assert.equal(afterMessage.currentActivity, "walk", "a chat message must not erase the real activity");
assert.equal(afterMessage.availability, "free");

const worker = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../src/engine/runtime.ts", import.meta.url), "utf8");
assert.match(worker, /CHARACTER PROFILE/);
assert.match(worker, /последними 2–3 сообщениями CHARACTER/);
assert.match(worker, /не повторяй тот же вводный оборот/);
assert.match(runtime, /characterProfile:\s*\{/);
assert.match(runtime, /occupation: profile\.occupation/);
assert.match(runtime, /interests: \[\.\.\.profile\.interests\]/);

console.log("PASS personality diversity, immutable profile anchors and live world continuity");
