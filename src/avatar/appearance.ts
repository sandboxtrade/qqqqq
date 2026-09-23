import type { RuntimeState } from "../engine/runtime";
import type { AvatarVisualCue } from "./visual-state";
import { characterAssets, fallbackAssetId, type CharacterAsset, type VisualContext } from "./asset-catalog";

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
