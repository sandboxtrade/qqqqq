/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import type { ResponsePlan } from "../cognition/cognition-types";
import type { RuntimeState } from "../engine/runtime";
import type { WorldLocation } from "../world/world";

// ---- visual-state.ts ----
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

// ---- asset-catalog.ts ----
export type VisualContext = "everyday" | "playful" | "romantic" | "resting";
export interface CharacterAsset {
  id: string;
  src: string;
  description: string;
  pose: string;
  outfit: string;
  expression: AvatarVisualCue;
  contexts: VisualContext[];
  locations: WorldLocation[];
  /** Same camera, framing and body alignment; only these groups crossfade. */
  transitionGroup: string;
  focalPoint: [number, number];
  motion: "still" | "reference_live_photo";
}

// Only existing, reviewed images belong here. Unknown poses must not use the
// calibrated eye/body shader of the reference photograph.
export const characterAssets: readonly CharacterAsset[] = [{
  id: "reference.main",
  src: "assets/character/avatar-main.jpg",
  description: "Исходный образ Юдзуки",
  pose: "reference",
  outfit: "reference",
  expression: "neutral",
  contexts: ["everyday"],
  locations: [],
  transitionGroup: "reference.main",
  focalPoint: [50, 12],
  motion: "reference_live_photo",
}];
export const fallbackAssetId = "reference.main";
export function validateAssetCatalog(assets: readonly CharacterAsset[], fallback = fallbackAssetId) {
  const ids = new Set<string>();
  for (const a of assets) {
    if (!a.id || ids.has(a.id)) throw new Error("Duplicate or empty character asset id");
    ids.add(a.id);
    if (!/^[a-zA-Z0-9._-]{1,100}$/u.test(a.id) ||
        !["still", "reference_live_photo"].includes(a.motion) ||
        !["neutral", "warm", "soft_smile", "curious", "annoyed_soft", "guarded", "sad_soft", "playful"].includes(a.expression) ||
        a.contexts.some(c => !["everyday", "playful", "romantic", "resting"].includes(c)) ||
        a.locations.some(l => !["bedroom", "living_room", "kitchen", "outside", "cafe", "unknown"].includes(l)))
      throw new Error(`Invalid asset metadata: ${a.id}`);
    if (!/^assets\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp)$/u.test(a.src) || a.src.includes(".."))
      throw new Error(`Invalid asset path: ${a.id}`);
    if (!a.pose || !a.outfit || !a.transitionGroup || !a.description || !a.contexts.length ||
        a.focalPoint.length !== 2 || a.focalPoint.some(v => !Number.isFinite(v) || v < 0 || v > 100))
      throw new Error(`Incomplete asset metadata: ${a.id}`);
    if (a.motion === "reference_live_photo" && a.src !== "assets/character/avatar-main.jpg")
      throw new Error("Live-photo calibration only supports the reference image");
  }
  if (!ids.has(fallback)) throw new Error("Missing character fallback asset");
}
validateAssetCatalog(characterAssets);
export function findCharacterAsset(id?: string) {
  return characterAssets.find(a => a.id === id) ?? characterAssets.find(a => a.id === fallbackAssetId)!;
}

// ---- appearance.ts ----
export interface AppearanceState {
  version: 1;
  assetId: string;
  selectedAt: number;
  outfitChangedAt: number;
}
export function decodeAppearance(raw: unknown): AppearanceState {
  if (!raw || typeof raw !== "object") throw new Error("Invalid appearance state");
  const a = raw as Record<string, unknown>;
  if (a.version !== 1 || typeof a.assetId !== "string" || !/^[a-zA-Z0-9._-]{1,100}$/u.test(a.assetId) ||
      [a.selectedAt, a.outfitChangedAt].some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0))
    throw new Error("Invalid appearance state");
  return { version: 1, assetId: a.assetId, selectedAt: a.selectedAt as number, outfitChangedAt: a.outfitChangedAt as number };
}
function context(runtime: RuntimeState): VisualContext {
  if (!runtime.world.isAwake || runtime.world.availability === "sleeping") return "resting";
  if (runtime.romance?.phase === "paused" || runtime.emotion.irritation >= 0.5 || runtime.emotion.sadness >= 0.55) return "everyday";
  if (runtime.romance?.phase === "playful") return "playful";
  if (runtime.romance?.phase === "romantic") return "romantic";
  return "everyday";
}
export function selectAppearance(runtime: RuntimeState, cue: AvatarVisualCue, now: number,
  assets: readonly CharacterAsset[] = characterAssets, fallbackId = fallbackAssetId): AppearanceState {
  const fallback = assets.find(a => a.id === fallbackId);
  if (!fallback) throw new Error("Missing appearance fallback");
  const previous = runtime.appearance;
  const current = assets.find(a => a.id === previous?.assetId);
  const desiredContext = context(runtime);
  const compatible = (a: CharacterAsset) => a.id === fallbackId ||
    ((!a.locations.length || a.locations.includes(runtime.world.currentLocation)) &&
     a.contexts.includes(desiredContext));
  // The private fade never selects a more revealing image or a staged scene.
  if (runtime.romance?.phase === "private" && current && previous) return previous;
  const currentValid = current && (current.id === fallbackId ||
    ((!current.locations.length || current.locations.includes(runtime.world.currentLocation)) &&
     (["playful", "romantic"].includes(desiredContext) || current.contexts.includes(desiredContext))));
  const score = (a: CharacterAsset) =>
    (a.expression === cue ? 6 : 0) + (a.contexts.includes(desiredContext) ? 5 : 0) +
    (a.locations.includes(runtime.world.currentLocation) ? 2 : 0) +
    (current && a.outfit === current.outfit ? 2 : 0);
  const candidates = assets.filter(a => compatible(a) &&
    (!currentValid || !previous || a.outfit === current.outfit ||
      (desiredContext === "romantic" && now - previous.outfitChangedAt >= 180_000 && now - previous.selectedAt >= 30_000)));
  const best = [...candidates].sort((a,b) => score(b)-score(a) || a.id.localeCompare(b.id))[0] ?? fallback;
  if (currentValid && previous && (best.id === current.id || now - previous.selectedAt < 12_000 || score(best) < score(current) + 3))
    return previous;
  const selected = best;
  return { version: 1, assetId: selected.id, selectedAt: now,
    outfitChangedAt: previous && current?.outfit === selected.outfit ? previous.outfitChangedAt : now };
}
export function transitionKind(a: CharacterAsset, b: CharacterAsset) {
  return a.transitionGroup === b.transitionGroup && a.pose === b.pose ? "dissolve" : "dip";
}
