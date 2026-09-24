/**
 * Consolidated avatar domain: motion state, image catalog, visual emotion
 * resolution and persisted appearance selection.
 */
import type { CharacterDecision, ResponsePlan } from "../cognition/cognition-types";
import type { RuntimeState } from "../engine/runtime";
import type { WorldLocation } from "../world/world";
import baseNeutralSceneSrc from "../assets/character/scenes/neutral.1.1.png";

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

// ---- visual-emotion vocabulary / resolver ----
export const VISUAL_EMOTION_VOCABULARY = [
  "neutral", "happy", "excited", "playful", "amused", "laughing", "gentle",
  "affectionate", "loving", "caring", "welcoming", "missing_you", "shy",
  "bashful", "embarrassed", "blushing", "nervous", "anxious", "surprised",
  "shocked", "confused", "curious", "thinking", "serious", "focused",
  "skeptical", "annoyed", "angry", "furious", "jealous", "pouting", "sad",
  "upset", "hurt", "crying", "lonely", "tired", "sleepy", "bored", "relaxed",
  "comfortable", "confident", "smug", "mischievous", "flirty", "teasing",
  "seductive", "intimate", "passionate", "desiring", "horny", "hornys",
] as const;

export type VisualEmotionName = (typeof VISUAL_EMOTION_VOCABULARY)[number];
const visualEmotionNames = new Set<string>(VISUAL_EMOTION_VOCABULARY);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const intensity10 = (value: number) => Math.max(1, Math.min(10, Math.round(1 + clamp01(value) * 9)));

export interface VisualEmotionState {
  emotion: VisualEmotionName;
  intensity: number;
  /** Difference from the next-best emotional interpretation. Used for hysteresis. */
  confidence: number;
  /** How strongly the current event argues for changing the visible image. */
  changeStrength: number;
}

export interface VisualEmotionContext {
  decision: CharacterDecision;
  responsePlan: ResponsePlan;
  dialogueActs?: readonly string[];
  sourceIntent?: string;
  eventIntensity?: number;
}

interface EmotionCandidate {
  emotion: VisualEmotionName;
  score: number;
  magnitude: number;
}

export function resolveVisualEmotionState(
  runtime: RuntimeState,
  context: VisualEmotionContext,
): VisualEmotionState {
  const e = runtime.emotion;
  const r = runtime.relationship;
  const romance = runtime.romance?.phase ?? "neutral";
  const intimacy = runtime.intimacy;
  const adultVisuals = intimacy?.adultModeEnabled === true;
  const intimacyPhase = adultVisuals ? intimacy?.phase ?? "normal" : "normal";
  const acts = new Set(context.dialogueActs ?? []);
  const intent = context.sourceIntent ?? "";
  const eventIntensity = clamp01(context.eventIntensity ?? 0.45);
  const candidates: EmotionCandidate[] = [];
  const add = (emotion: VisualEmotionName, score: number, magnitude = score) => {
    candidates.push({ emotion, score: clamp01(score), magnitude: clamp01(magnitude) });
  };

  const positive = clamp01(e.happiness * 0.48 + e.affection * 0.34 + e.mood * 0.18);
  const closeness = clamp01(r.closeness * 0.52 + r.attachment * 0.28 + r.trust * 0.2);
  const tension = clamp01(e.irritation * 0.62 + r.unresolvedTension * 0.38);
  const lowEnergy = 1 - e.energy;

  add("neutral", 0.34, 0.25);
  add("happy", 0.24 + e.happiness * 0.68, e.happiness);
  add("excited", e.happiness * 0.42 + e.energy * 0.48 + (acts.has("HAPPINESS") ? 0.2 : 0), e.energy * e.happiness);
  add("gentle", e.affection * 0.36 + (1 - tension) * 0.25 + (1 - e.energy) * 0.18, e.affection * 0.55);
  add("relaxed", (1 - e.anxiety) * 0.35 + (1 - e.irritation) * 0.26 + (1 - Math.abs(e.energy - 0.48)) * 0.18, 1 - e.anxiety);
  add("comfortable", closeness * 0.45 + r.security * 0.28 + positive * 0.2, closeness);
  const confidenceSceneDamping = romance === "private" ? 0.72 : romance === "romantic" ? 0.88 : 1;
  add("confident", ((1 - e.anxiety) * 0.35 + r.security * 0.24 + r.respect * 0.18 + (context.decision.confidence * 0.2)) * confidenceSceneDamping, context.decision.confidence);

  add("curious", e.curiosity * 0.58 + (acts.has("CURIOSITY") || context.decision.action === "ask" ? 0.28 : 0), e.curiosity);
  add("thinking", e.curiosity * 0.34 + (context.decision.content.stance === "uncertain" ? 0.32 : 0) + (acts.has("CLARIFY") ? 0.18 : 0), Math.max(e.curiosity, eventIntensity));
  add("confused", (acts.has("CLARIFY") ? 0.62 : 0) + (intent === "unknown" ? 0.28 : 0), Math.max(0.35, eventIntensity));
  add("serious", (["set_boundary", "refuse"].includes(context.decision.action) ? 0.68 : 0.12) + context.responsePlan.directness * 0.2, Math.max(tension, context.responsePlan.directness));
  add("focused", (context.decision.content.mode === "factual" ? 0.46 : 0.12) + context.responsePlan.directness * 0.28 + e.curiosity * 0.16, context.responsePlan.directness);
  add("skeptical", (context.decision.action === "challenge" ? 0.78 : context.decision.action === "disagree" ? 0.55 : 0.06) + (context.decision.content.stance === "uncertain" ? 0.12 : 0), context.decision.confidence);

  add("annoyed", e.irritation * 0.7 + r.unresolvedTension * 0.18, e.irritation);
  add("angry", Math.max(0, e.irritation - 0.35) * 1.25 + r.unresolvedTension * 0.14, e.irritation);
  add("furious", Math.max(0, e.irritation - 0.7) * 2.25 + (context.decision.action === "set_boundary" ? 0.08 : 0), e.irritation);
  add("pouting", e.irritation * 0.32 + e.affection * 0.25 + (context.decision.tone.includes("restrained") ? 0.16 : 0), Math.max(e.irritation, e.affection * 0.6));
  add("jealous", (acts.has("JEALOUSY") ? 0.82 : 0) + e.affection * r.attachment * 0.16, eventIntensity);

  add("sad", e.sadness * 0.72 + (acts.has("SADNESS") ? 0.18 : 0), e.sadness);
  add("upset", e.sadness * 0.5 + tension * 0.32 + (context.decision.tone.includes("hurt") ? 0.16 : 0), Math.max(e.sadness, tension));
  add("hurt", e.sadness * 0.46 + r.unresolvedTension * 0.28 + (context.decision.tone.includes("hurt") ? 0.34 : 0), Math.max(e.sadness, r.unresolvedTension));
  add("crying", Math.max(0, e.sadness - 0.65) * 1.9 + (acts.has("SADNESS") ? 0.08 : 0), e.sadness);
  add("lonely", e.sadness * 0.28 + runtime.world.connectionDrive * 0.48 + r.attachment * 0.14, runtime.world.connectionDrive);
  add("anxious", e.anxiety * 0.78 + (runtime.world.availability === "occupied" ? 0.08 : 0), e.anxiety);
  add("nervous", e.anxiety * 0.5 + (romance === "playful" || romance === "romantic" ? 0.18 : 0) + e.affection * 0.12, e.anxiety);

  add("tired", lowEnergy * 0.66 + (runtime.world.availability === "resting" ? 0.2 : 0), lowEnergy);
  add("sleepy", (!runtime.world.isAwake || runtime.world.availability === "sleeping" ? 0.94 : lowEnergy * 0.48), lowEnergy);
  add("bored", e.boredom * 0.82 + lowEnergy * 0.08, e.boredom);

  add("caring", (acts.has("CARE") || acts.has("COMFORT") || acts.has("REASSURE") ? 0.72 : 0.08) + e.affection * 0.16, Math.max(e.affection, eventIntensity));
  add("affectionate", e.affection * 0.58 + closeness * 0.2 + (context.decision.action === "show_affection" ? 0.26 : 0), e.affection);
  add("loving", Math.max(0, e.affection - 0.48) * 0.7 + closeness * 0.34 + (romance === "romantic" ? 0.18 : 0) + (intimacyPhase === "aftercare" ? 0.24 : 0), Math.max(e.affection, closeness));
  if (intimacyPhase === "aftercare") {
    add("gentle", 0.78 + e.affection * 0.14, Math.max(e.affection, intimacy?.comfort ?? 0));
    add("affectionate", 0.72 + closeness * 0.18, Math.max(e.affection, closeness));
    add("caring", 0.7 + (intimacy?.comfort ?? 0) * 0.2, Math.max(e.affection, intimacy?.comfort ?? 0));
  }
  add("welcoming", (acts.has("WELCOME_BACK") ? 0.82 : 0) + positive * 0.1, eventIntensity);
  add("missing_you", (acts.has("MISS_USER") ? 0.88 : 0) + runtime.world.connectionDrive * r.attachment * 0.35, Math.max(runtime.world.connectionDrive, r.attachment));

  const flirtSignal = acts.has("FLIRT") || acts.has("INTIMACY_APPROACH") || acts.has("INTIMACY_RECIPROCATE") || romance === "playful" || romance === "romantic" || romance === "private";
  const romanticDrive = clamp01(
    e.romanticInterest * 0.42 + e.affection * 0.2 + closeness * 0.16 + e.energy * 0.08 +
    (adultVisuals ? (intimacy?.interest ?? 0) * 0.08 + (intimacy?.arousal ?? 0) * 0.06 : 0),
  );
  add("playful", (acts.has("TEASE") || acts.has("JOKE") ? 0.66 : 0.08) + (romance === "playful" ? 0.32 : 0) + e.happiness * 0.12, Math.max(e.happiness, e.energy));
  add("amused", (acts.has("JOKE") ? 0.68 : 0.04) + e.happiness * 0.22, e.happiness);
  add("laughing", (acts.has("JOKE") && e.happiness > 0.65 ? 0.72 : 0) + Math.max(0, e.happiness - 0.75) * 0.55, e.happiness);
  add("mischievous", (acts.has("TEASE") ? 0.66 : 0.04) + (romance === "playful" ? 0.25 : 0) + e.energy * 0.1, Math.max(e.energy, e.happiness));
  add("teasing", (acts.has("TEASE") ? 0.82 : 0) + (romance === "playful" ? 0.18 : 0), eventIntensity);
  add("flirty", (flirtSignal ? 0.52 : 0.02) + romanticDrive * 0.38, romanticDrive);
  add("shy", (flirtSignal ? 0.24 : 0.02) + e.anxiety * 0.34 + e.affection * 0.2 + (acts.has("FLIRT") ? 0.18 : 0), Math.max(e.anxiety, romanticDrive * 0.7));
  add("bashful", (acts.has("FLIRT") ? 0.38 : 0) + e.anxiety * 0.24 + romanticDrive * 0.3, Math.max(e.anxiety, romanticDrive));
  add("embarrassed", (acts.has("FLIRT") && e.anxiety > 0.3 ? 0.46 : 0.02) + e.anxiety * 0.32, e.anxiety);
  add("blushing", (acts.has("FLIRT") && romanticDrive > 0.58 ? 0.5 : 0) + e.anxiety * 0.18 + romanticDrive * 0.24, romanticDrive);

  // Mature visual states are driven by the dedicated intimacy state. A private
  // romance scene alone is not enough to produce explicit arousal visuals.
  if (adultVisuals) {
    const arousal = intimacy?.arousal ?? 0;
    const phaseClose = intimacyPhase === "close";
    const phaseIntimate = intimacyPhase === "intimate";
    const phaseHigh = intimacyPhase === "high_intimacy";
    add("intimate", (phaseIntimate ? 0.64 : phaseHigh ? 0.56 : phaseClose ? 0.28 : 0) + romanticDrive * 0.16, Math.max(romanticDrive, arousal));
    add("seductive", (phaseIntimate || phaseHigh ? 0.34 : phaseClose ? 0.16 : 0) + romanticDrive * 0.28 + (acts.has("FLIRT") ? 0.1 : 0), Math.max(romanticDrive, arousal));
    add("passionate", (phaseHigh ? 0.5 : phaseIntimate ? 0.26 : 0) + Math.max(0, arousal - 0.48) * 0.85, Math.max(romanticDrive, arousal));
    add("desiring", (phaseHigh ? 0.4 : phaseIntimate ? 0.2 : 0) + Math.max(0, arousal - 0.58) * 1.05, Math.max(romanticDrive, arousal));
    // horny is internal arousal; hornys additionally requires outward intimate behaviour.
    add("horny", (phaseHigh ? 0.5 : phaseIntimate ? 0.2 : 0) + Math.max(0, arousal - 0.68) * 1.5, arousal);
    add("hornys", (phaseHigh && acts.has("INTIMACY_RECIPROCATE") ? 0.66 : 0) + Math.max(0, arousal - 0.8) * (acts.has("INTIMACY_RECIPROCATE") ? 2.2 : 0.35), arousal);
  }

  add("surprised", (acts.has("SURPRISE") ? 0.76 : 0) + (intent === "share_good_event" ? eventIntensity * 0.12 : 0), eventIntensity);
  add("shocked", (acts.has("SURPRISE") && eventIntensity > 0.78 ? 0.66 + eventIntensity * 0.18 : 0), eventIntensity);
  add("smug", (context.decision.confidence > 0.86 && ["agree", "disagree"].includes(context.decision.action) ? 0.38 : 0) + positive * 0.18, context.decision.confidence);

  candidates.sort((a, b) => b.score - a.score || b.magnitude - a.magnitude || a.emotion.localeCompare(b.emotion));
  const first = candidates[0] ?? { emotion: "neutral" as const, score: 0.34, magnitude: 0.25 };
  const second = candidates[1]?.score ?? 0;
  return {
    emotion: first.emotion,
    intensity: intensity10(first.magnitude),
    confidence: clamp01(first.score - second + 0.45),
    changeStrength: clamp01(Math.max(first.score, eventIntensity * 0.78)),
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
  expression: AvatarVisualCue | VisualEmotionName;
  contexts: VisualContext[];
  locations: WorldLocation[];
  /** Same camera/framing and body alignment; only these groups crossfade. */
  transitionGroup: string;
  focalPoint: [number, number];
  motion: "still" | "reference_live_photo";
  visualEmotion?: { emotion: VisualEmotionName; intensity: number; variant: number };
  sceneFit?: "cover" | "contain";
  sceneScale?: number;
  scenePosition?: [number, number];
}

export function parseVisualEmotionFilename(filename: string) {
  const name = filename.split(/[\\/]/u).at(-1) ?? filename;
  const match = /^([a-z_]+)\.(10|[1-9])\.([1-9]\d*)\.(png|jpe?g|webp)$/iu.exec(name);
  if (!match) return null;
  const emotion = match[1].toLowerCase();
  if (!visualEmotionNames.has(emotion)) return null;
  return {
    emotion: emotion as VisualEmotionName,
    intensity: Number(match[2]),
    variant: Number(match[3]),
    extension: match[4].toLowerCase(),
  };
}

// Vite expands these globs at build time. Both lowercase and uppercase file
// extensions are accepted so images uploaded directly from iPhone/GitHub work.
const sceneImageModules = {
  ...import.meta.glob("../assets/character/scenes/*.{png,jpg,jpeg,webp}", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>,
  ...import.meta.glob("../assets/character/scenes/*.{PNG,JPG,JPEG,WEBP}", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>,
};

const scenePresets: Record<string, Pick<CharacterAsset, "sceneFit" | "sceneScale" | "scenePosition" | "pose" | "description">> = {
  "neutral.1.1": {
    sceneFit: "contain",
    sceneScale: 0.98,
    scenePosition: [50, 50],
    pose: "bedroom-sitting",
    description: "Yuzuki sitting on the bed in her room",
  },
};

function createSceneAsset(src: string, emotion: VisualEmotionName, intensity: number, variant: number): CharacterAsset {
  const presetKey = `${emotion}.${intensity}.${variant}`;
  const preset = scenePresets[presetKey] ?? {
    sceneFit: "contain" as const,
    sceneScale: 0.98,
    scenePosition: [50, 50] as [number, number],
    pose: `scene-${variant}`,
    description: `Yuzuki: ${emotion}, intensity ${intensity}, variant ${variant}`,
  };
  return {
    id: `scene.${emotion}.${intensity}.${variant}`,
    src,
    description: preset.description,
    pose: preset.pose,
    outfit: "scene-set",
    expression: emotion,
    contexts: ["everyday", "playful", "romantic", "resting"] as VisualContext[],
    locations: [],
    transitionGroup: "scene-photo",
    focalPoint: [50, 50],
    motion: "still",
    visualEmotion: { emotion, intensity, variant },
    sceneFit: preset.sceneFit,
    sceneScale: preset.sceneScale,
    scenePosition: preset.scenePosition,
  };
}

function buildSceneAssets(): CharacterAsset[] {
  const byId = new Map<string, CharacterAsset>();
  const extensionPriority = (path: string) => {
    const lower = path.toLowerCase();
    if (lower.endsWith(".png")) return 0;
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return 1;
    return 2;
  };
  const entries = Object.entries(sceneImageModules).sort((a, b) =>
    extensionPriority(a[0]) - extensionPriority(b[0]) || a[0].localeCompare(b[0]),
  );
  for (const [path, src] of entries) {
    const parsed = parseVisualEmotionFilename(path);
    if (!parsed || typeof src !== "string") continue;
    const asset = createSceneAsset(src, parsed.emotion, parsed.intensity, parsed.variant);
    // Same emotion/intensity/variant in another extension must never crash the app.
    if (!byId.has(asset.id)) byId.set(asset.id, asset);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

const placeholderAsset: CharacterAsset = {
  id: "placeholder.neutral",
  src: "assets/character/placeholder-avatar.png",
  description: "Yuzuki placeholder silhouette",
  pose: "placeholder",
  outfit: "placeholder",
  expression: "neutral",
  contexts: ["everyday"],
  locations: [],
  transitionGroup: "scene-photo",
  focalPoint: [50, 50],
  motion: "still",
  sceneFit: "contain",
  sceneScale: 1,
  scenePosition: [50, 50],
};

const bundledFallbackScene = createSceneAsset(baseNeutralSceneSrc, "neutral", 1, 1);
const discoveredSceneAssets = buildSceneAssets().filter((asset) => asset.id !== bundledFallbackScene.id);
export const characterAssets: readonly CharacterAsset[] = discoveredSceneAssets.length
  ? [bundledFallbackScene, ...discoveredSceneAssets, placeholderAsset]
  : [bundledFallbackScene, placeholderAsset];
export const fallbackAssetId = bundledFallbackScene.id;

const legacyExpressions = new Set<AvatarVisualCue>([
  "neutral", "warm", "soft_smile", "curious", "annoyed_soft", "guarded", "sad_soft", "playful",
]);

export function validateAssetCatalog(assets: readonly CharacterAsset[], fallback = fallbackAssetId) {
  const ids = new Set<string>();
  for (const a of assets) {
    if (!a.id || ids.has(a.id)) throw new Error("Duplicate or empty character asset id");
    ids.add(a.id);
    if (!/^[a-zA-Z0-9._-]{1,100}$/u.test(a.id) ||
        !["still", "reference_live_photo"].includes(a.motion) ||
        (!legacyExpressions.has(a.expression as AvatarVisualCue) && !visualEmotionNames.has(a.expression)) ||
        a.contexts.some(c => !["everyday", "playful", "romantic", "resting"].includes(c)) ||
        a.locations.some(l => !["bedroom", "living_room", "kitchen", "outside", "cafe", "unknown"].includes(l)))
      throw new Error(`Invalid asset metadata: ${a.id}`);
    // Vite may rewrite imported assets to relative, root-relative, blob/data,
    // or absolute URLs depending on the production base. Do not validate the
    // generated URL shape here; only reject empty or executable protocols.
    if (typeof a.src !== "string" || !a.src.trim() || /^(?:javascript|vbscript):/iu.test(a.src.trim()))
      throw new Error(`Invalid asset path: ${a.id}`);
    if (!a.pose || !a.outfit || !a.transitionGroup || !a.description || !a.contexts.length ||
        a.focalPoint.length !== 2 || a.focalPoint.some(v => !Number.isFinite(v) || v < 0 || v > 100) ||
        (a.scenePosition && (a.scenePosition.length !== 2 || a.scenePosition.some(v => !Number.isFinite(v) || v < 0 || v > 100))) ||
        (a.sceneScale !== undefined && (!Number.isFinite(a.sceneScale) || a.sceneScale <= 0 || a.sceneScale > 3)))
      throw new Error(`Incomplete asset metadata: ${a.id}`);
    if (a.visualEmotion) {
      if (!visualEmotionNames.has(a.visualEmotion.emotion) ||
          !Number.isInteger(a.visualEmotion.intensity) || a.visualEmotion.intensity < 1 || a.visualEmotion.intensity > 10 ||
          !Number.isInteger(a.visualEmotion.variant) || a.visualEmotion.variant < 1)
        throw new Error(`Invalid visual emotion metadata: ${a.id}`);
    }
    if (a.motion === "reference_live_photo" && (a.id !== placeholderAsset.id || a.src !== placeholderAsset.src))
      throw new Error("Live-photo calibration only supports the placeholder calibration image");
  }
  if (!ids.has(fallback)) throw new Error("Missing character fallback asset");
}
try {
  validateAssetCatalog(characterAssets);
} catch (error) {
  console.error("[avatar] asset catalog validation failed; continuing with safe fallback", error);
}

export function findCharacterAsset(id?: string) {
  const resolved = id ? characterAssets.find((asset) => asset.id === id) : undefined;
  if (resolved && resolved.id !== placeholderAsset.id) return resolved;
  return characterAssets.find((asset) => asset.id === fallbackAssetId) ?? bundledFallbackScene;
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
  if (runtime.romance?.phase === "playful") return "playful";
  if (["romantic", "private"].includes(runtime.romance?.phase ?? "")) return "romantic";
  return "everyday";
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function chooseVariant(candidates: CharacterAsset[], recentAssetIds: readonly string[], seed: string) {
  const recent = new Set(recentAssetIds.slice(-3));
  let pool = candidates.filter((asset) => !recent.has(asset.id));
  if (!pool.length) {
    const current = recentAssetIds.at(-1);
    pool = candidates.filter((asset) => asset.id !== current);
  }
  if (!pool.length) pool = candidates;
  const ordered = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  return ordered[hashString(seed) % ordered.length];
}

const visualEmotionFallbacks: Partial<Record<VisualEmotionName, readonly VisualEmotionName[]>> = {
  happy: ["excited", "neutral"],
  playful: ["excited", "embarrassed", "neutral"],
  amused: ["excited", "neutral"],
  laughing: ["excited", "neutral"],
  confident: ["excited", "neutral"],
  mischievous: ["excited", "embarrassed", "neutral"],
  teasing: ["excited", "embarrassed", "neutral"],
  welcoming: ["excited", "loving", "neutral"],

  affectionate: ["loving", "neutral"],
  missing_you: ["loving", "neutral"],
  gentle: ["neutral", "loving"],
  caring: ["neutral", "loving"],
  relaxed: ["neutral"],
  comfortable: ["neutral"],

  shy: ["embarrassed", "nervous", "neutral"],
  bashful: ["embarrassed", "nervous", "neutral"],
  blushing: ["embarrassed", "nervous", "neutral"],
  anxious: ["nervous", "neutral"],
  jealous: ["nervous", "neutral"],

  curious: ["confused", "neutral"],
  thinking: ["confused", "neutral"],
  skeptical: ["confused", "neutral"],
  surprised: ["confused", "excited", "neutral"],
  shocked: ["confused", "nervous", "neutral"],

  flirty: ["embarrassed", "excited", "loving", "neutral"],
  seductive: ["loving", "embarrassed", "neutral"],
  intimate: ["loving", "neutral"],
  passionate: ["loving", "excited", "neutral"],
  desiring: ["loving", "embarrassed", "neutral"],
  // horny is internal arousal. Deliberately never fall back to hornys, which
  // represents active outward sexual behaviour.
  horny: ["loving", "neutral"],

  annoyed: ["neutral", "nervous"],
  angry: ["neutral", "nervous"],
  furious: ["neutral", "nervous"],
  pouting: ["embarrassed", "neutral"],
  sad: ["neutral", "nervous"],
  upset: ["nervous", "neutral"],
  hurt: ["nervous", "neutral"],
  crying: ["nervous", "neutral"],
  lonely: ["neutral", "loving"],
  tired: ["neutral"],
  sleepy: ["neutral"],
  bored: ["neutral"],
  serious: ["neutral", "confused"],
  focused: ["neutral", "confused"],
};

export function resolveAvailableVisualEmotion(
  requested: VisualEmotionName,
  assets: readonly CharacterAsset[],
  runtime?: Pick<RuntimeState, "emotion" | "relationship" | "intimacy">,
): VisualEmotionName | null {
  const available = new Set(
    assets.flatMap((asset) => asset.visualEmotion ? [asset.visualEmotion.emotion] : []),
  );
  if (available.has(requested)) return requested;

  let fallbacks: readonly VisualEmotionName[] = visualEmotionFallbacks[requested] ?? ["neutral"];
  // A flirty expression without nervousness reads better as energetic than
  // embarrassed. With visible anxiety, embarrassment is the closer image.
  if (requested === "flirty" && runtime && runtime.emotion.anxiety < 0.24) {
    fallbacks = ["excited", "loving", "embarrassed", "neutral"];
  }
  // Mature-but-not-outward states may use a warm image, but never the explicit
  // hornys pose. hornys itself is only selected when the Brain emitted hornys.
  const matureInternalStates: readonly VisualEmotionName[] = ["seductive", "intimate", "passionate", "desiring", "horny"];
  if (matureInternalStates.includes(requested) && runtime?.intimacy?.adultModeEnabled !== true) {
    fallbacks = ["loving", "neutral"];
  }
  return fallbacks.find((emotion) => available.has(emotion)) ??
    (available.has("neutral") ? "neutral" : null);
}

function legacySelectAppearance(
  runtime: RuntimeState,
  cue: AvatarVisualCue,
  now: number,
  assets: readonly CharacterAsset[],
  fallbackId: string,
): AppearanceState {
  const fallback = assets.find(a => a.id === fallbackId);
  if (!fallback) throw new Error("Missing appearance fallback");
  const previous = runtime.appearance;
  const current = assets.find(a => a.id === previous?.assetId);
  const desiredContext = context(runtime);
  const compatible = (a: CharacterAsset) => a.id === fallbackId ||
    ((!a.locations.length || a.locations.includes(runtime.world.currentLocation)) && a.contexts.includes(desiredContext));
  const currentValid = current && compatible(current);
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
  return { version: 1, assetId: best.id, selectedAt: now,
    outfitChangedAt: previous && current?.outfit === best.outfit ? previous.outfitChangedAt : now };
}

export interface AppearanceSelectionOptions {
  assets?: readonly CharacterAsset[];
  fallbackId?: string;
  recentAssetIds?: readonly string[];
  seed?: string;
}

function isCharacterAssetArray(
  value: AppearanceSelectionOptions | readonly CharacterAsset[],
): value is readonly CharacterAsset[] {
  return Array.isArray(value);
}

export function selectAppearance(
  runtime: RuntimeState,
  request: AvatarVisualCue | VisualEmotionState,
  now: number,
  optionsOrAssets: AppearanceSelectionOptions | readonly CharacterAsset[] = {},
  legacyFallbackId = fallbackAssetId,
): AppearanceState {
  // Backwards-compatible path for existing reviewed scene assets and tests.
  const suppliedAssets = isCharacterAssetArray(optionsOrAssets);
  if (typeof request === "string") {
    const assets: readonly CharacterAsset[] = suppliedAssets
      ? optionsOrAssets
      : optionsOrAssets.assets ?? characterAssets;
    const fallbackId = suppliedAssets
      ? (optionsOrAssets.some((asset) => asset.id === legacyFallbackId)
          ? legacyFallbackId
          : optionsOrAssets[0]?.id ?? legacyFallbackId)
      : optionsOrAssets.fallbackId ?? fallbackAssetId;
    return legacySelectAppearance(runtime, request, now, assets, fallbackId);
  }

  const options: AppearanceSelectionOptions = suppliedAssets
    ? { assets: optionsOrAssets }
    : optionsOrAssets;
  const assets = options.assets ?? characterAssets;
  const requestedFallbackId = options.fallbackId ?? fallbackAssetId;
  const fallback = assets.find((asset) => asset.id === requestedFallbackId) ??
    assets.find((asset) => asset.visualEmotion?.emotion === "neutral") ??
    assets[0];
  if (!fallback) throw new Error("Missing appearance fallback");
  const fallbackId = fallback.id;
  const previous = runtime.appearance;
  const current = assets.find((asset) => asset.id === previous?.assetId);
  const currentVisual = current?.visualEmotion;
  const targetEmotion = resolveAvailableVisualEmotion(request.emotion, assets, runtime);
  const emotionPool = targetEmotion
    ? assets.filter((asset) => asset.visualEmotion?.emotion === targetEmotion)
    : [];
  if (!emotionPool.length) return current && previous ? previous : {
    version: 1, assetId: fallback.id, selectedAt: now, outfitChangedAt: now,
  };
  const availableLevels = [...new Set(emotionPool.map((asset) => asset.visualEmotion!.intensity))]
    .sort((a, b) => Math.abs(a - request.intensity) - Math.abs(b - request.intensity) || a - b);
  const level = availableLevels[0];

  if (currentVisual && previous) {
    const sameEmotion = currentVisual.emotion === targetEmotion;
    const intensityShift = Math.abs(currentVisual.intensity - request.intensity);
    const age = Math.max(0, now - previous.selectedAt);
    // Stable state: keep the current photo instead of changing on every line.
    if (sameEmotion && intensityShift <= 1 && age < 90_000) return previous;
    // Mild re-interpretations are intentionally sticky; a strong emotional turn
    // bypasses this delay and may change immediately.
    if (!sameEmotion && request.changeStrength < 0.62 && intensityShift < 3 && age < 18_000)
      return previous;
  }

  const levelCandidates = emotionPool.filter((asset) => asset.visualEmotion?.intensity === level);
  const recent = [...(options.recentAssetIds ?? []), ...(previous ? [previous.assetId] : [])];
  const selected = chooseVariant(
    levelCandidates,
    recent,
    `${options.seed ?? "visual"}|${targetEmotion}|${request.intensity}|${level}|${recent.slice(-4).join("|")}`,
  );
  if (previous && selected.id === previous.assetId) return previous;
  return {
    version: 1,
    assetId: selected.id,
    selectedAt: now,
    outfitChangedAt: previous && current?.outfit === selected.outfit ? previous.outfitChangedAt : now,
  };
}

export function transitionKind(a: CharacterAsset, b: CharacterAsset) {
  return a.transitionGroup === b.transitionGroup && a.pose === b.pose ? "dissolve" : "dip";
}
