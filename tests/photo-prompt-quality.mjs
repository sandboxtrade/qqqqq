import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

const dir = mkdtempSync(join(tmpdir(), "yuzuki-photo-prompt-"));
try {
  const workerPath = join(dir, "worker-prompt-test.mjs");
  const source = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8")
    + "\nexport { buildPhotoPrompt, buildOrdinaryPhotoRetryPrompt, buildOpenAICasualPrimaryPrompt, buildWaveSpeedPhotoPrompt };\n";
  writeFileSync(workerPath, source);
  const worker = await import(`${pathToFileURL(workerPath).href}?v=${Date.now()}`);
  const { characterProfiles } = await import("../src/character/character-registry.ts");

  const dirtyVisualProfile = {
    identitySummary: "взрослая девушка 24 лет, pretty girl, young lady, female person; девочка не должна меняться",
    defaultPhotoStyle: "natural smartphone photo of a girl / lady",
    expressionGuidance: "эта девушка уверенная; female subject with natural expression",
    defaultOutfits: ["casual"],
  };
  const base = {
    character: { name: "Yuzuki", age: 24 },
    visualProfile: dirtyVisualProfile,
    decision: { intent: { framing: "full_body", mood: "confident", pose: "standing naturally", location: "bedroom", outfit: "casual clothes", suggestiveLevel: "none" } },
    world: { location: "bedroom" },
    signals: { emotionTone: "warm", intimacyTone: "none" },
  };

  const forbidden = /\bgirls?\b|\blad(?:y|ies)\b|\bfemale\b|девушк|девочк|девчон|барышн/iu;
  for (const build of [worker.buildPhotoPrompt, worker.buildOrdinaryPhotoRetryPrompt, worker.buildOpenAICasualPrimaryPrompt]) {
    const prompt = build(base, 1);
    assert.doesNotMatch(prompt, forbidden);
    assert.match(prompt, /adult woman|женщин|взросл/iu);
  }


  // Audit the real visual profile of every registered character through every image-prompt path.
  for (const profile of characterProfiles) {
    const packet = {
      character: { name: profile.core.name, age: profile.core.age },
      visualProfile: profile.visualProfile,
      decision: { intent: { framing: "full_body", mood: "natural", pose: "standing naturally", location: profile.visualProfile.defaultLocations[0] || "home", outfit: profile.visualProfile.defaultOutfits[0] || "casual clothes", suggestiveLevel: "none" } },
      world: { location: profile.visualProfile.defaultLocations[0] || "home" },
      signals: { emotionTone: "neutral", intimacyTone: "none" },
    };
    for (const build of [worker.buildPhotoPrompt, worker.buildOrdinaryPhotoRetryPrompt, worker.buildOpenAICasualPrimaryPrompt, worker.buildWaveSpeedPhotoPrompt]) {
      const prompt = build(packet, 1);
      assert.doesNotMatch(prompt, forbidden, `${profile.id}: forbidden person wording leaked into image prompt`);
      assert.match(prompt, /adult woman|женщин|взросл/iu, `${profile.id}: adult-woman wording missing`);
    }
  }

  const intimate = worker.buildWaveSpeedPhotoPrompt({
    ...base,
    decision: { intent: { framing: "full_body", mood: "sensual", pose: "standing", location: "bedroom", outfit: "topless", suggestiveLevel: "high" } },
    signals: { emotionTone: "shy", intimacyTone: "high_arousal" },
  }, 1);
  assert.doesNotMatch(intimate, forbidden);
  assert.match(intimate, /женщин|adult woman/iu);
  assert.match(intimate, /Уровень откровенности/iu);
  assert.match(intimate, /топлесс должен читаться явно/iu);
  assert.match(intimate, /Избегай Т-позы|Т-позы/iu);
  assert.match(intimate, /полный рост|в кадре целиком видны/iu);
  assert.match(intimate, /один цельный кадр|второго изображения внутри кадра/iu);
  assert.doesNotMatch(intimate, /public\/assets\/profiles|avatar\.jpg|identity-sheet\.jpg/iu);
  assert.doesNotMatch(intimate, /смартфон|телефон|smartphone|\bphone\b/iu);

  const directFullBody = worker.buildWaveSpeedPhotoPrompt({
    ...base,
    decision: { intent: { framing: "full_body", mood: "playful", pose: "rear three-quarter view", location: "bedroom", outfit: "fitted feminine casual", suggestiveLevel: "low" } },
  }, 1);
  assert.match(directFullBody, /Камера: режим прямого кадра/iu);
  assert.match(directFullBody, /никаких устройств/iu);
  assert.doesNotMatch(directFullBody, /смартфон|телефон|smartphone|\bphone\b/iu);
  assert.ok(directFullBody.length < 2400, `WaveSpeed prompt should stay compact: ${directFullBody.length}`);
  assert.ok(directFullBody.split("\n").length >= 8, "prompt should remain structured instead of one giant paragraph");
  assert.doesNotMatch(directFullBody, /public\/assets|referenceAssetIds|identity-sheet\.(?:jpg|png)/iu);

  console.log("PASS photo prompt adult wording, intimate intent fidelity and natural pose quality");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
