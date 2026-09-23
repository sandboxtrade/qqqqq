import type { ResponsePlan } from "../cognition/cognition-types";
import type { RuntimeState } from "../engine/runtime";

export type AvatarVisualCue = ResponsePlan["visualCue"];

export interface AvatarVisualState {
  cue: AvatarVisualCue;
  motion: number;
  breath: number;
  sway: number;
  tiltBias: number;
  rest: number;
  thinking: number;
}

const cueProfiles: Record<
  AvatarVisualCue,
  Pick<AvatarVisualState, "motion" | "breath" | "sway" | "tiltBias">
> = {
  neutral: { motion: 0.76, breath: 0.96, sway: 0.64, tiltBias: 0 },
  warm: { motion: 0.86, breath: 1.02, sway: 0.68, tiltBias: 0.002 },
  soft_smile: { motion: 0.82, breath: 1, sway: 0.58, tiltBias: 0.001 },
  curious: { motion: 0.94, breath: 0.94, sway: 0.8, tiltBias: 0.008 },
  annoyed_soft: { motion: 0.58, breath: 0.86, sway: 0.34, tiltBias: -0.004 },
  guarded: { motion: 0.48, breath: 0.8, sway: 0.24, tiltBias: -0.003 },
  sad_soft: { motion: 0.44, breath: 0.84, sway: 0.22, tiltBias: -0.006 },
  playful: { motion: 1.04, breath: 1.06, sway: 1, tiltBias: 0.009 },
};

export function deriveAvatarCue(runtime: RuntimeState | null): AvatarVisualCue {
  if (!runtime) return "neutral";
  const { emotion, world } = runtime;
  if (!world.isAwake || world.availability === "sleeping") return "guarded";
  if (emotion.irritation >= 0.58) return "annoyed_soft";
  if (emotion.sadness >= 0.56) return "sad_soft";
  if (emotion.affection >= 0.64 && emotion.mood >= 0.56) return "warm";
  if (runtime.romance?.phase === "playful") return "playful";
  if (runtime.romance?.phase === "romantic") return "warm";
  if (emotion.curiosity >= 0.62) return "curious";
  if (emotion.happiness >= 0.66 || emotion.mood >= 0.67) return "soft_smile";
  return "neutral";
}

export function resolveAvatarVisualState(
  runtime: RuntimeState | null,
  requestedCue: AvatarVisualCue | null,
  busy: boolean,
): AvatarVisualState {
  const cue = requestedCue ?? deriveAvatarCue(runtime);
  const profile = cueProfiles[cue];
  const energy = runtime?.emotion.energy ?? 0.55;
  const awake = runtime?.world.isAwake ?? true;
  const sleeping = runtime?.world.availability === "sleeping" || !awake;
  const energyFactor = 0.72 + Math.max(0, Math.min(1, energy)) * 0.42;

  if (sleeping) {
    return {
      cue,
      motion: 0.18,
      breath: 0.72,
      sway: 0.08,
      tiltBias: -0.003,
      rest: 1,
      thinking: 0,
    };
  }

  return {
    cue,
    motion: Math.min(1.12, profile.motion * energyFactor + (busy ? 0.05 : 0)),
    breath: profile.breath * (0.9 + energy * 0.14),
    sway: profile.sway * (0.82 + energy * 0.22),
    tiltBias: profile.tiltBias,
    rest: 0,
    thinking: busy ? 1 : 0,
  };
}
