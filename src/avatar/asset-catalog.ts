import type { AvatarVisualCue } from "./visual-state";
import type { WorldLocation } from "../world/world-types";

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
