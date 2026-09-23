import type { EmotionalState, EmotionDelta } from "./emotion-types";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function deriveMood(
  state: Pick<
    EmotionalState,
    "happiness" | "affection" | "irritation" | "sadness" | "anxiety"
  >,
) {
  return clamp(
    (state.happiness +
      state.affection * 0.4 -
      state.irritation * 0.55 -
      state.sadness * 0.5 -
      state.anxiety * 0.25) /
      1.4,
  );
}

const initialBase = {
  energy: 0.68,
  happiness: 0.54,
  irritation: 0.08,
  sadness: 0.05,
  anxiety: 0.07,
  curiosity: 0.7,
  boredom: 0.12,
  affection: 0.42,
  romanticInterest: 0.28,
};

export const initialEmotionalState: EmotionalState = {
  ...initialBase,
  mood: deriveMood(initialBase),
  updatedAt: Date.now(),
};

export function applyEmotionDelta(
  state: EmotionalState,
  delta: EmotionDelta,
  now = Date.now(),
): EmotionalState {
  const next = { ...state };
  for (const [key, value] of Object.entries(delta)) {
    if (typeof value !== "number" || key === "updatedAt" || key === "mood")
      continue;
    const typedKey = key as keyof Omit<EmotionalState, "updatedAt" | "mood">;
    next[typedKey] = clamp((next[typedKey] as number) + value) as never;
  }
  next.mood = deriveMood(next);
  next.updatedAt = now;
  return next;
}

export function decayEmotions(
  state: EmotionalState,
  now = Date.now(),
): EmotionalState {
  const hours = Math.max(0, (now - state.updatedAt) / 3_600_000);
  if (hours === 0) {
    const mood = deriveMood(state);
    return mood === state.mood ? state : { ...state, mood };
  }

  const toward = (value: number, baseline: number, rate: number) =>
    clamp(baseline + (value - baseline) * Math.exp(-rate * hours));

  const next: EmotionalState = {
    ...state,
    energy: toward(state.energy, 0.58, 0.06),
    happiness: toward(state.happiness, 0.5, 0.04),
    irritation: toward(state.irritation, 0.06, 0.16),
    sadness: toward(state.sadness, 0.05, 0.08),
    anxiety: toward(state.anxiety, 0.06, 0.1),
    curiosity: toward(state.curiosity, 0.62, 0.03),
    boredom: toward(state.boredom, 0.12, 0.08),
    // Affection and romantic interest are intentionally slow-moving, but not frozen forever.
    affection: toward(state.affection, 0.42, 0.004),
    romanticInterest: toward(state.romanticInterest, 0.28, 0.003),
    updatedAt: now,
  };
  next.mood = deriveMood(next);
  return next;
}
