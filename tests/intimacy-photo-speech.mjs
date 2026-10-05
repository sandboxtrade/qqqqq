import assert from "node:assert/strict";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

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

const { detectIntimacySignal } = await import("../src/mechanics/turn-signals.ts");
const { resolveAppearanceRequest } = await import("../src/avatar/appearance-request.ts");

const photoSignal = detectIntimacySignal("скинь фотку сзади в нижнем белье");
assert.equal(photoSignal.kind, "none");
assert.equal(photoSignal.intimacyContext, true);
assert.equal(photoSignal.strength, 0);

const now = Date.now();
const pausedRuntime = {
  revision: 1,
  emotion: { mood: 0.6, energy: 0.6, happiness: 0.6, sadness: 0.1, irritation: 0.05, anxiety: 0.05, curiosity: 0.5, boredom: 0.1, affection: 0.8, romanticInterest: 0.8, updatedAt: now },
  relationship: { stage: "deep", trust: 0.9, closeness: 0.9, attachment: 0.85, security: 0.85, respect: 0.9, unresolvedTension: 0.02, updatedAt: now },
  world: { currentLocation: "bedroom", currentActivity: "chatting", availability: "free", isAwake: true },
  intimacy: { revision: 1, adultModeEnabled: true, phase: "paused", interactionStatus: "paused", comfort: 0.8, interest: 0.8, arousal: 0.6, initiativeDrive: 0, activeScene: null, storagePolicy: "memories_only", updatedAt: now },
};
const pausedSuggestive = resolveAppearanceRequest(
  pausedRuntime,
  { emotion: "shy", intensity: 6, confidence: 0.8, changeStrength: 0.7 },
  { requested: true, vibe: "seductive", strength: 0.9, explicit: true, suggestive: true, wantsDifferentVariant: true },
  "paused-no-refusal",
  { photoNoRefusalMode: true },
);
assert.equal(pausedSuggestive.outcome, "refused");
assert.equal(pausedSuggestive.reason, "intimacy-paused");

const dir = mkdtempSync(join(tmpdir(), "yuzuki-intimacy-photo-"));
try {
  const workerPath = join(dir, "worker-test.mjs");
  const workerSource = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8")
    + "\nexport { derivePhotoMechanic, reconcilePhotoMechanic, reconcilePhotoSendMessages, buildWaveSpeedPhotoPrompt, buildPhotoPrompt };\n";
  writeFileSync(workerPath, workerSource);
  const worker = await import(`${pathToFileURL(workerPath).href}?v=${Date.now()}`);

  const baseRaw = {
    character: { id: "yuzuki_v1", name: "Yuzuki", age: 24 },
    world: { isAwake: true, availability: "free" },
    emotion: { irritation: 0.1, anxiety: 0.1 },
    relationship: { trust: 0.8, closeness: 0.8 },
    intimacy: { enabled: true, interactionStatus: "open", arousal: 0.7, comfort: 0.7, interest: 0.7, mind: { outwardArousal: true, wantsMore: true, conflicted: false } },
    photoPolicy: { noRefusalMode: true },
    recentHistory: [{ role: "character", text: "[Отправила фотографию: full_body; настроение shy; поза standing; место bedroom; одежда lingerie; уровень medium]" }],
  };
  const directSelf = worker.derivePhotoMechanic(baseRaw, "покажи себя");
  assert.equal(directSelf.disposition, "send");
  assert.equal(directSelf.continuation, false);

  const directBreast = worker.derivePhotoMechanic(baseRaw, "Скинь грудь");
  assert.ok(directBreast);
  assert.equal(directBreast.disposition, "send");
  assert.equal(directBreast.continuation, false);
  assert.equal(directBreast.suggestive, true);
  assert.equal(directBreast.intentPatch.framing, "upper_body");
  assert.equal(directBreast.intentPatch.outfit, "topless");
  assert.equal(directBreast.intentPatch.suggestiveLevel, "high");

  const continued = worker.derivePhotoMechanic(baseRaw, "ещё одну");
  assert.equal(continued.disposition, "send");
  assert.equal(continued.continuation, true);
  assert.equal(continued.suggestive, true);
  assert.equal(continued.intentPatch.framing, "full_body");
  assert.equal(continued.intentPatch.outfit, "lingerie");
  assert.equal(continued.intentPatch.suggestiveLevel, "medium");

  const changedFraming = worker.derivePhotoMechanic(baseRaw, "теперь в зеркале");
  assert.equal(changedFraming.continuation, true);
  assert.equal(changedFraming.intentPatch.framing, "mirror");
  assert.equal(changedFraming.intentPatch.suggestiveLevel, "medium");

  const buttFollowUp = worker.derivePhotoMechanic(baseRaw, "давай ещё попку");
  assert.equal(buttFollowUp.continuation, true);
  assert.equal(buttFollowUp.disposition, "send");
  assert.equal(buttFollowUp.intentPatch.framing, "full_body");
  assert.match(buttFollowUp.intentPatch.pose, /со спины|ягодиц/iu);
  assert.equal(buttFollowUp.intentPatch.suggestiveLevel, "medium");

  const clothingReset = worker.derivePhotoMechanic(baseRaw, "теперь в белых лосинах");
  assert.equal(clothingReset.continuation, true);
  assert.equal(clothingReset.intentPatch.outfit, "белые лосины");
  assert.equal(clothingReset.intentPatch.suggestiveLevel, "none", "ordinary clothing must clear inherited lingerie exposure");

  const portraitHistory = {
    ...baseRaw,
    recentHistory: [{ role: "character", text: "[Отправила фотографию: portrait; настроение relaxed; поза непринуждённо смотрит в камеру; место кафе; одежда повседневный стильный образ; уровень none]" }],
  };
  const fullBodyOverride = worker.derivePhotoMechanic(portraitHistory, "скинь в полный рост");
  assert.equal(fullBodyOverride.continuation, true);
  assert.equal(fullBodyOverride.intentPatch.framing, "full_body");

  for (const followUp of [
    "фотку ещё",
    "можно ещё?",
    "ещё раз",
    "скинь ещё",
    "покажи такую же",
    "снова",
    "другой ракурс",
    "в лосинах",
  ]) {
    const mechanic = worker.derivePhotoMechanic(baseRaw, followUp);
    assert.ok(mechanic, `follow-up must stay in photo mode: ${followUp}`);
    assert.equal(mechanic.disposition, "send", followUp);
    assert.equal(mechanic.continuation, true, followUp);
  }
  assert.equal(worker.derivePhotoMechanic(baseRaw, "спасибо, красиво"), undefined);

  const appearanceContinuation = worker.derivePhotoMechanic({
    ...baseRaw,
    appearanceRequest: { requestedVibe: "different", outcome: "accepted", suggestive: false },
  }, "повернись боком");
  assert.equal(appearanceContinuation.continuation, true);
  assert.equal(appearanceContinuation.disposition, "send");

  const noContext = worker.derivePhotoMechanic({ ...baseRaw, recentHistory: [] }, "теперь со спины");
  assert.equal(noContext, undefined);

  const constrained = worker.derivePhotoMechanic({ ...baseRaw, constraint: { locked: true } }, "скинь сексуальное фото");
  assert.equal(constrained.disposition, "blocked");

  const genericSuggestive = worker.derivePhotoMechanic(baseRaw, "скинь сексуальное фото");
  const genericDecision = worker.reconcilePhotoMechanic({
    shouldSendPhoto: true,
    reason: "user_requested",
    caption: "щас",
    intent: { framing: "selfie", mood: "playful", pose: "natural", location: "bedroom", outfit: "current outfit", suggestiveLevel: "none" },
  }, genericSuggestive, "reply");
  assert.equal(genericDecision.suggestiveLevel, undefined);
  assert.equal(genericDecision.intent.suggestiveLevel, "low");

  const lingerieMechanic = worker.derivePhotoMechanic(baseRaw, "скинь фотку в полный рост в нижнем белье");
  const preserved = worker.reconcilePhotoMechanic({
    shouldSendPhoto: true,
    reason: "user_requested",
    caption: "",
    intent: { framing: "selfie", mood: "shy", pose: "standing", location: "bedroom", outfit: "current outfit", suggestiveLevel: "none" },
  }, { ...lingerieMechanic, disposition: "choice", noRefusalMode: false }, "reply");
  assert.equal(preserved.intent.framing, "full_body");
  assert.equal(preserved.intent.outfit, "lingerie");
  assert.equal(preserved.intent.suggestiveLevel, "medium");

  const ordinaryChoice = worker.reconcilePhotoMechanic({
    shouldSendPhoto: true,
    reason: "user_requested",
    caption: "",
    intent: { framing: "selfie", mood: "natural", pose: "natural", location: "home", outfit: "lingerie", suggestiveLevel: "high" },
  }, { requested: true, suggestive: false, disposition: "choice", noRefusalMode: false, intentPatch: { framing: "full_body" } }, "reply");
  assert.equal(ordinaryChoice.intent.framing, "full_body");
  assert.equal(ordinaryChoice.intent.suggestiveLevel, "none");
  assert.match(ordinaryChoice.intent.outfit, /fully clothed/iu);

  const reconciledSpeech = worker.reconcilePhotoSendMessages(["не буду такое отправлять"], { requested: true, disposition: "choice" }, {
    shouldSendPhoto: true, caption: "секунду", intent: ordinaryChoice.intent,
  });
  assert.deepEqual(reconciledSpeech, ["секунду"]);

  const forcedNope = worker.reconcilePhotoSendMessages(["неа, второй раз уже не скину"], { requested: true, disposition: "send", noRefusalMode: true }, {
    shouldSendPhoto: true, caption: "секунду", intent: ordinaryChoice.intent,
  });
  assert.deepEqual(forcedNope, ["секунду"]);

  const forcedEnough = worker.reconcilePhotoSendMessages(["одной хватит"], { requested: true, disposition: "send", noRefusalMode: true }, {
    shouldSendPhoto: true, caption: "щас", intent: ordinaryChoice.intent,
  });
  assert.deepEqual(forcedEnough, ["щас"]);

  const forcedBodyRefusal = worker.reconcilePhotoSendMessages(["Нет. Я уже сказала, что грудь не покажу. Давай сменим тему."], { requested: true, disposition: "send", noRefusalMode: true }, {
    shouldSendPhoto: true, caption: "", intent: ordinaryChoice.intent,
  });
  assert.deepEqual(forcedBodyRefusal, ["секунду."]);

  const forcedBodyAcceptance = worker.reconcilePhotoSendMessages(["ладно, сейчас скину"], { requested: true, disposition: "send", noRefusalMode: true }, {
    shouldSendPhoto: true, caption: "", intent: ordinaryChoice.intent,
  });
  assert.deepEqual(forcedBodyAcceptance, ["ладно, сейчас скину"]);

  const prompt = worker.buildWaveSpeedPhotoPrompt({
    character: { name: "Yuzuki", age: 24 },
    visualProfile: { identitySummary: "вымышленная взрослая девушка 24 лет, same adult girl", defaultPhotoStyle: "natural smartphone photo of a girl", expressionGuidance: "эта девушка reserved but expressive", defaultOutfits: ["casual"] },
    decision: { intent: { framing: "selfie", mood: "shy", pose: "natural", location: "bedroom", outfit: "lingerie", suggestiveLevel: "medium" } },
    world: { location: "bedroom" },
    signals: { emotionTone: "shy", intimacyTone: "high_arousal" },
  }, 1);
  assert.match(prompt, /Тон близости в переписке: сильно возбуждённый/);
  assert.match(prompt, /Поза и одежда из итогового запроса/);
  assert.match(prompt, /Уровень откровенности: умеренно интимный/);
  assert.match(prompt, /Камера: режим личного селфи|Камера:/iu);
  assert.match(prompt, /без видимого устройства|никаких устройств/iu);
  assert.doesNotMatch(prompt, /смартфон|телефон|smartphone|\bphone\b/iu);
  assert.match(prompt, /adult woman|женщин/iu);
  assert.doesNotMatch(prompt, /\bgirl(?:s)?\b|девушк|девочк/iu);

  const toplessPrompt = worker.buildWaveSpeedPhotoPrompt({
    character: { name: "Yuzuki", age: 24 },
    visualProfile: { identitySummary: "same adult woman", defaultPhotoStyle: "natural smartphone photo", expressionGuidance: "reserved but expressive", defaultOutfits: ["casual"] },
    decision: { intent: { framing: "upper_body", mood: "sensual", pose: "reclining naturally", location: "bedroom", outfit: "topless", suggestiveLevel: "high" } },
    world: { location: "bedroom" },
    signals: { emotionTone: "desire", intimacyTone: "high_arousal" },
  }, 1);
  assert.match(toplessPrompt, /топлесс должен читаться явно/iu);
  assert.match(toplessPrompt, /не заменять лифчиком, бельём/iu);
  assert.doesNotMatch(toplessPrompt, /\bgirl(?:s)?\b|девушк|девочк/iu);

  const lowPrompt = worker.buildPhotoPrompt({
    character: { name: "Yuzuki", age: 24 },
    visualProfile: { identitySummary: "same adult woman", defaultPhotoStyle: "natural smartphone photo", expressionGuidance: "reserved but expressive", defaultOutfits: ["casual"] },
    decision: { intent: { framing: "selfie", mood: "playful", pose: "natural", location: "home", outfit: "casual clothes", suggestiveLevel: "low" } },
    world: { location: "home" },
    signals: { emotionTone: "amused", intimacyTone: "aroused" },
  }, 1);
  assert.match(lowPrompt, /Уровень откровенности: лёгкий/);
  assert.match(lowPrompt, /одежду не делать откровеннее запроса/);

  const workerText = readFileSync(new URL("../cloudflare/worker.js", import.meta.url), "utf8");
  assert.match(workerText, /Сам факт просьбы об интимном фото не означает/);
  assert.match(workerText, /CURRENT-TURN constraint/);
  assert.match(workerText, /активный CURRENT-TURN stop\/pause\/boundary/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("PASS intimacy/photo/speech consistency checks");
