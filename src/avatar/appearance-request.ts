import type { RuntimeState } from "../engine/runtime";
import type { VisualEmotionName, VisualEmotionState } from "./avatar-model";

export type AppearanceRequestVibe =
  | "different"
  | "neutral"
  | "happy"
  | "playful"
  | "affectionate"
  | "shy"
  | "confident"
  | "angry"
  | "sad"
  | "seductive";

export interface AppearanceRequestInput {
  requested: boolean;
  vibe: AppearanceRequestVibe;
  strength: number;
  explicit: boolean;
  suggestive: boolean;
  wantsDifferentVariant: boolean;
  rawHint?: string;
}

export type AppearanceRequestOutcome = "none" | "accepted" | "partial" | "refused";

export interface AppearanceRequestResolution {
  requested: boolean;
  requestedVibe: AppearanceRequestVibe;
  suggestive: boolean;
  outcome: AppearanceRequestOutcome;
  reason: string;
  selectedEmotion: VisualEmotionName;
  forceVariantChange: boolean;
  visualEmotion: VisualEmotionState;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function hash01(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

const targetEmotion: Record<AppearanceRequestVibe, VisualEmotionName | null> = {
  different: null,
  neutral: "neutral",
  happy: "happy",
  playful: "playful",
  affectionate: "affectionate",
  shy: "shy",
  confident: "confident",
  angry: "angry",
  sad: "sad",
  seductive: "seductive",
};

function withVisual(
  base: VisualEmotionState,
  emotion: VisualEmotionName,
  strength: number,
): VisualEmotionState {
  const desiredIntensity = Math.max(
    2,
    Math.min(10, Math.round(2.5 + clamp01(strength) * 6.5)),
  );
  return {
    emotion,
    intensity: Math.max(base.intensity - 1, desiredIntensity),
    confidence: Math.max(base.confidence, 0.72),
    changeStrength: 1,
  };
}

function negativeState(runtime: RuntimeState) {
  return Math.max(
    runtime.emotion.irritation,
    runtime.relationship.unresolvedTension,
    runtime.emotion.sadness * 0.72,
    runtime.emotion.anxiety * 0.55,
  );
}

function bond(runtime: RuntimeState) {
  return clamp01(
    runtime.relationship.closeness * 0.31 +
      runtime.relationship.trust * 0.24 +
      runtime.relationship.attachment * 0.19 +
      runtime.relationship.security * 0.12 +
      runtime.relationship.respect * 0.07 +
      runtime.emotion.affection * 0.07,
  );
}

function refusalVisual(runtime: RuntimeState, base: VisualEmotionState) {
  if (runtime.emotion.irritation >= 0.72)
    return withVisual(base, "angry", runtime.emotion.irritation);
  if (
    runtime.emotion.irritation >= 0.42 ||
    runtime.relationship.unresolvedTension >= 0.34
  )
    return withVisual(
      base,
      "annoyed",
      Math.max(
        runtime.emotion.irritation,
        runtime.relationship.unresolvedTension,
      ),
    );
  return { ...base, changeStrength: Math.max(base.changeStrength, 0.84) };
}

/**
 * A direct pose request is influence, not a command. The current emotion and
 * relationship decide whether Yuzuki actually follows it, chooses her own
 * softer version, or refuses it visually.
 *
 * This function never mutates emotion/relationship state. It only chooses the
 * visible scene. State changes caused by the request are handled separately by
 * the cognition state-effects layer.
 */
export function resolveAppearanceRequest(
  runtime: RuntimeState,
  base: VisualEmotionState,
  request: AppearanceRequestInput,
  seed: string,
): AppearanceRequestResolution {
  if (!request.requested) {
    return {
      requested: false,
      requestedVibe: "different",
      suggestive: false,
      outcome: "none",
      reason: "no-request",
      selectedEmotion: base.emotion,
      forceVariantChange: false,
      visualEmotion: base,
    };
  }

  const closeness = bond(runtime);
  const negative = negativeState(runtime);
  const roll = hash01(`${seed}|${request.vibe}|${request.rawHint ?? ""}`);
  const intimacy = runtime.intimacy;
  const stage = runtime.relationship.stage;
  const matureBond = ["close", "deep"].includes(stage) && closeness >= 0.52;
  const paused = ["paused", "stopped", "hesitant"].includes(
    intimacy?.interactionStatus ?? "inactive",
  );

  if (request.suggestive) {
    if (intimacy?.adultModeEnabled !== true) {
      return {
        requested: true,
        requestedVibe: request.vibe,
        suggestive: true,
        outcome: "refused",
        reason: "adult-mode-off",
        selectedEmotion: base.emotion,
        forceVariantChange: false,
        visualEmotion: refusalVisual(runtime, base),
      };
    }
    if (paused) {
      return {
        requested: true,
        requestedVibe: request.vibe,
        suggestive: true,
        outcome: "refused",
        reason: "intimacy-paused",
        selectedEmotion: base.emotion,
        forceVariantChange: false,
        visualEmotion: refusalVisual(runtime, base),
      };
    }
    if (
      runtime.emotion.irritation >= 0.43 ||
      runtime.relationship.unresolvedTension >= 0.34
    ) {
      const visual = refusalVisual(runtime, base);
      return {
        requested: true,
        requestedVibe: request.vibe,
        suggestive: true,
        outcome: "refused",
        reason: "emotion-conflict",
        selectedEmotion: visual.emotion,
        forceVariantChange: visual.emotion !== base.emotion,
        visualEmotion: visual,
      };
    }
    if (!matureBond) {
      const canSoften =
        closeness >= 0.4 &&
        runtime.emotion.affection >= 0.48 &&
        runtime.emotion.irritation < 0.28;
      const visual = canSoften
        ? withVisual(
            base,
            runtime.emotion.anxiety >= 0.28 ? "shy" : "flirty",
            request.strength * 0.72,
          )
        : base;
      return {
        requested: true,
        requestedVibe: request.vibe,
        suggestive: true,
        outcome: canSoften ? "partial" : "refused",
        reason: canSoften ? "too-early-softened" : "relationship-too-early",
        selectedEmotion: visual.emotion,
        forceVariantChange: canSoften,
        visualEmotion: visual,
      };
    }

    const willingness = clamp01(
      0.34 +
        closeness * 0.38 +
        (intimacy?.arousal ?? 0) * 0.14 +
        runtime.emotion.romanticInterest * 0.14 +
        runtime.emotion.happiness * 0.06 -
        negative * 0.48,
    );
    if (roll <= willingness) {
      const visual = withVisual(base, "seductive", request.strength);
      return {
        requested: true,
        requestedVibe: request.vibe,
        suggestive: true,
        outcome: "accepted",
        reason: "willing",
        selectedEmotion: visual.emotion,
        forceVariantChange: true,
        visualEmotion: visual,
      };
    }

    const softEmotion: VisualEmotionName =
      runtime.emotion.anxiety >= 0.28 ? "shy" : "flirty";
    const visual = withVisual(base, softEmotion, request.strength * 0.68);
    return {
      requested: true,
      requestedVibe: request.vibe,
      suggestive: true,
      outcome: "partial",
      reason: "chose-own-version",
      selectedEmotion: visual.emotion,
      forceVariantChange: true,
      visualEmotion: visual,
    };
  }

  if (request.vibe === "different") {
    // A normal pose/photo request should be predictable. Keep real autonomy for
    // sleep or a genuinely strong negative state, but do not randomly reject
    // a neutral "поменяй позу".
    const blocked =
      !runtime.world.isAwake ||
      runtime.world.availability === "sleeping" ||
      negative >= 0.82;
    return {
      requested: true,
      requestedVibe: request.vibe,
      suggestive: false,
      outcome: blocked ? "refused" : "accepted",
      reason: blocked ? "strong-state-conflict" : "variant-change",
      selectedEmotion: base.emotion,
      forceVariantChange: !blocked,
      visualEmotion: blocked ? base : { ...base, changeStrength: 1 },
    };
  }

  const target = targetEmotion[request.vibe] ?? base.emotion;
  const positiveRequest = [
    "happy",
    "playful",
    "affectionate",
    "shy",
    "confident",
  ].includes(request.vibe);
  if (positiveRequest && negative >= 0.62) {
    const canSoften =
      request.vibe === "affectionate" &&
      runtime.relationship.closeness >= 0.58 &&
      runtime.emotion.irritation < 0.7;
    const visual = canSoften
      ? withVisual(base, "pouting", request.strength * 0.65)
      : refusalVisual(runtime, base);
    return {
      requested: true,
      requestedVibe: request.vibe,
      suggestive: false,
      outcome: canSoften ? "partial" : "refused",
      reason: canSoften
        ? "emotion-overrides-request"
        : "strong-emotion-conflict",
      selectedEmotion: visual.emotion,
      forceVariantChange: canSoften || visual.emotion !== base.emotion,
      visualEmotion: visual,
    };
  }

  const compatibility =
    request.vibe === "angry"
      ? runtime.emotion.irritation
      : request.vibe === "sad"
        ? runtime.emotion.sadness
        : request.vibe === "happy"
          ? runtime.emotion.happiness
          : request.vibe === "affectionate"
            ? runtime.emotion.affection
            : request.vibe === "playful"
              ? Math.max(
                  runtime.emotion.happiness,
                  runtime.emotion.curiosity,
                )
              : 0.55;
  const willingness = clamp01(
    0.6 +
      closeness * 0.16 +
      compatibility * 0.18 -
      negative * (positiveRequest ? 0.24 : 0.08),
  );
  if (roll <= willingness) {
    const visual = withVisual(base, target, request.strength);
    return {
      requested: true,
      requestedVibe: request.vibe,
      suggestive: false,
      outcome: "accepted",
      reason: "willing",
      selectedEmotion: visual.emotion,
      forceVariantChange: true,
      visualEmotion: visual,
    };
  }

  return {
    requested: true,
    requestedVibe: request.vibe,
    suggestive: false,
    outcome: "refused",
    reason: "chose-not-to-change",
    selectedEmotion: base.emotion,
    forceVariantChange: false,
    visualEmotion: base,
  };
}
