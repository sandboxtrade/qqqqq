import { getAuth } from "firebase/auth";
import {
  getFirebaseApp,
  getFirebaseAppCheckToken,
  isFirebaseConfigured,
} from "../storage/firebase";
import { runtimeCloudLanguageEndpoint } from "../config/runtime-config";
import { bounded } from "../core/async";

export type CloudLanguageRole = "user" | "character";

export interface CloudLanguageInput {
  mode?: "reply" | "initiative";
  character?: {
    id: string;
    name: string;
    age: number;
  };
  /** Current user text. Initiative mode intentionally sends an empty string. */
  userText: string;
  /** User-editable stable character description. */
  personality: string;
  /** User-editable canonical long-term memory. */
  memory: string;
  proactive?: {
    kind: string;
    topic?: string;
    reason?: string;
    priority?: number;
    quietMinutes?: number;
  };
  sceneMechanic?: {
    mode: string;
    family?: string;
    step?: number;
    maxStep?: number;
    heat?: number;
  };
  appearanceRequest?: {
    requestedVibe: string;
    outcome: string;
    reason: string;
    selectedEmotion: string;
    suggestive: boolean;
  };
  constraint?: {
    locked: boolean;
    kind: string;
    summary?: string;
  };
  world: {
    timeOfDay: string;
    location: string;
    activity: string;
    availability: string;
    isAwake: boolean;
    connectionDrive: number;
    activityDetail?: string;
  };
  relationship: {
    stage: string;
    trust: number;
    closeness: number;
    attachment: number;
    security: number;
    respect: number;
    unresolvedTension: number;
  };
  emotion: {
    mood: number;
    energy: number;
    happiness: number;
    sadness: number;
    irritation: number;
    anxiety: number;
    curiosity: number;
    boredom: number;
    affection: number;
    romanticInterest: number;
  };
  romancePhase?: string;
  intimacy?: {
    enabled: boolean;
    phase: string;
    interactionStatus: string;
    comfort: number;
    interest: number;
    arousal: number;
    initiativeDrive: number;
    signal: {
      kind: string;
      strength: number;
      explicit: boolean;
      intimacyContext: boolean;
    };
    mind: {
      active: boolean;
      tenderness: number;
      desire: number;
      caution: number;
      playfulness: number;
      confidence: number;
      conflicted: boolean;
      preferredPace: string;
      inwardArousal: boolean;
      outwardArousal: boolean;
      wantsCloseness: boolean;
      wantsMore: boolean;
      activePreferenceKeys: string[];
      reflection: string;
    };
  };
  /** Recent chronological surface dialogue. Current user message is separate. */
  recentHistory: Array<{ role: CloudLanguageRole; text: string }>;
  silent: boolean;
}

export interface CloudLanguageUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface CloudLanguageBudget {
  requestChars?: number;
  originalRequestChars?: number;
  estimatedInputTokens?: number;
  estimatedMaxCostUsd?: number;
  compacted?: boolean;
  compactionSteps?: string[];
}

export interface CloudConversationMetadata {
  topic?: string;
  continuesPrevious?: boolean;
}

export type PhotoDecisionReason = "none" | "user_requested" | "self_initiated";
export type PhotoFraming = "selfie" | "mirror" | "portrait" | "upper_body" | "full_body";
export type PhotoSuggestiveLevel = "none" | "low" | "medium" | "high";

export interface CloudPhotoIntent {
  framing: PhotoFraming;
  mood: string;
  pose: string;
  location: string;
  outfit: string;
  suggestiveLevel: PhotoSuggestiveLevel;
}

export interface CloudPhotoDecision {
  shouldSendPhoto: boolean;
  reason: PhotoDecisionReason;
  caption?: string;
  intent?: CloudPhotoIntent;
}

export interface CloudLanguageSignals {
  userTone?: string;
  relationshipEvent?: string;
  memoryUsed?: boolean;
  emotionTone?: string;
  /** How Yuzuki herself is outwardly presenting intimacy in this generated turn. */
  intimacyTone?: "none" | "flirty" | "aroused" | "high_arousal";
}

export interface CloudEmotionReaction {
  happiness: number;
  sadness: number;
  irritation: number;
  anxiety: number;
  curiosity: number;
  boredom: number;
  affection: number;
  romanticInterest: number;
}

export interface CloudRelationshipReaction {
  trust: number;
  closeness: number;
  attachment: number;
  security: number;
  respect: number;
  unresolvedTension: number;
}

export interface CloudIntimacyReaction {
  comfort: number;
  interest: number;
  arousal: number;
  initiativeDrive: number;
}

export interface CloudLanguageResult {
  attempted: boolean;
  used: boolean;
  /** Combined text for guards/debug/backward compatibility. */
  text?: string;
  /** One to three separate chat bubbles chosen by the model. */
  messages?: string[];
  model?: string;
  usage?: CloudLanguageUsage;
  budget?: CloudLanguageBudget;
  conversation?: CloudConversationMetadata;
  signals?: CloudLanguageSignals;
  /** Initiative mode may deliberately decide not to send anything. */
  shouldInitiate?: boolean;
  /** Raw model-requested deltas. Runtime clamps them before persistence. */
  emotionReaction?: CloudEmotionReaction;
  relationshipReaction?: CloudRelationshipReaction;
  intimacyReaction?: CloudIntimacyReaction;
  /** Semantic photo decision only. Actual image generation is a separate service. */
  photoDecision?: CloudPhotoDecision;
  reason?: string;
}

interface WorkerReply {
  text?: unknown;
  messages?: unknown;
  model?: unknown;
  skipped?: unknown;
  reason?: unknown;
  error?: unknown;
  conversation?: {
    topic?: unknown;
    continuesPrevious?: unknown;
  };
  signals?: {
    userTone?: unknown;
    relationshipEvent?: unknown;
    memoryUsed?: unknown;
    emotionTone?: unknown;
    intimacyTone?: unknown;
  };
  shouldInitiate?: unknown;
  emotionReaction?: Record<string, unknown>;
  relationshipReaction?: Record<string, unknown>;
  intimacyReaction?: Record<string, unknown>;
  photoDecision?: {
    shouldSendPhoto?: unknown;
    reason?: unknown;
    caption?: unknown;
    intent?: {
      framing?: unknown;
      mood?: unknown;
      pose?: unknown;
      location?: unknown;
      outfit?: unknown;
      suggestiveLevel?: unknown;
    };
  };
  usage?: {
    inputTokens?: unknown;
    cachedInputTokens?: unknown;
    cacheWriteTokens?: unknown;
    outputTokens?: unknown;
    estimatedCostUsd?: unknown;
  };
  budget?: {
    requestChars?: unknown;
    originalRequestChars?: unknown;
    estimatedInputTokens?: unknown;
    estimatedMaxCostUsd?: unknown;
    compacted?: unknown;
    compactionSteps?: unknown;
  };
}

const TOKEN_PREP_TIMEOUT_MS = 4_000;
const WORKER_REQUEST_TIMEOUT_MS = 12_000;
const TRANSIENT_CIRCUIT_MS = 2_000;
const NOT_FOUND_CIRCUIT_MS = 10 * 60_000;
let unavailableUntil = 0;

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asOptionalString(value: unknown, max = 180) {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/gu, " ").trim().slice(0, max)
    : undefined;
}

function reasonFromError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return raw.replace(/\s+/gu, " ").trim().slice(0, 180) || "cloud-language-error";
}

function looksLikeAssistantMeta(text: string) {
  return /(?:как\s+(?:ии|ai)|я\s+(?:не\s+могу|не\s+имею\s+возможности)|openai|языков(?:ая|ой)\s+модел|политик(?:а|и)\s+безопасности|system\s+prompt|local\s+brain|локальн(?:ый|ого)\s+движок)/iu.test(text);
}

function parseUsage(raw: WorkerReply["usage"]): CloudLanguageUsage | undefined {
  if (!raw) return undefined;
  return {
    inputTokens: asNumber(raw.inputTokens),
    cachedInputTokens: asNumber(raw.cachedInputTokens),
    cacheWriteTokens: asNumber(raw.cacheWriteTokens),
    outputTokens: asNumber(raw.outputTokens),
    estimatedCostUsd: asNumber(raw.estimatedCostUsd),
  };
}

function parseBudget(raw: WorkerReply["budget"]): CloudLanguageBudget | undefined {
  if (!raw) return undefined;
  const compactionSteps = Array.isArray(raw.compactionSteps)
    ? raw.compactionSteps.filter((item): item is string => typeof item === "string").slice(0, 20)
    : undefined;
  return {
    requestChars: asOptionalNumber(raw.requestChars),
    originalRequestChars: asOptionalNumber(raw.originalRequestChars),
    estimatedInputTokens: asOptionalNumber(raw.estimatedInputTokens),
    estimatedMaxCostUsd: asOptionalNumber(raw.estimatedMaxCostUsd),
    compacted: typeof raw.compacted === "boolean" ? raw.compacted : undefined,
    compactionSteps,
  };
}

function parseConversation(raw: WorkerReply["conversation"]): CloudConversationMetadata | undefined {
  if (!raw) return undefined;
  return {
    topic: asOptionalString(raw.topic, 100),
    continuesPrevious: typeof raw.continuesPrevious === "boolean" ? raw.continuesPrevious : undefined,
  };
}

function parseSignals(raw: WorkerReply["signals"]): CloudLanguageSignals | undefined {
  if (!raw) return undefined;
  return {
    userTone: asOptionalString(raw.userTone, 32),
    relationshipEvent: asOptionalString(raw.relationshipEvent, 32),
    memoryUsed: typeof raw.memoryUsed === "boolean" ? raw.memoryUsed : undefined,
    emotionTone: asOptionalString(raw.emotionTone, 32),
    intimacyTone: ["none", "flirty", "aroused", "high_arousal"].includes(String(raw.intimacyTone ?? ""))
      ? raw.intimacyTone as CloudLanguageSignals["intimacyTone"]
      : undefined,
  };
}

function boundedDelta(value: unknown, limit = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(-limit, Math.min(limit, value));
}

function parseEmotionReaction(raw: WorkerReply["emotionReaction"]): CloudEmotionReaction | undefined {
  if (!raw) return undefined;
  return {
    happiness: boundedDelta(raw.happiness),
    sadness: boundedDelta(raw.sadness),
    irritation: boundedDelta(raw.irritation),
    anxiety: boundedDelta(raw.anxiety),
    curiosity: boundedDelta(raw.curiosity),
    boredom: boundedDelta(raw.boredom),
    affection: boundedDelta(raw.affection),
    romanticInterest: boundedDelta(raw.romanticInterest),
  };
}

function parseRelationshipReaction(raw: WorkerReply["relationshipReaction"]): CloudRelationshipReaction | undefined {
  if (!raw) return undefined;
  return {
    trust: boundedDelta(raw.trust),
    closeness: boundedDelta(raw.closeness),
    attachment: boundedDelta(raw.attachment),
    security: boundedDelta(raw.security),
    respect: boundedDelta(raw.respect),
    unresolvedTension: boundedDelta(raw.unresolvedTension),
  };
}

function parseIntimacyReaction(raw: WorkerReply["intimacyReaction"]): CloudIntimacyReaction | undefined {
  if (!raw) return undefined;
  return {
    comfort: boundedDelta(raw.comfort),
    interest: boundedDelta(raw.interest),
    arousal: boundedDelta(raw.arousal),
    initiativeDrive: boundedDelta(raw.initiativeDrive),
  };
}

function parsePhotoDecision(raw: WorkerReply["photoDecision"]): CloudPhotoDecision | undefined {
  if (!raw) return undefined;
  const requested = raw.shouldSendPhoto === true;
  const reasonValue = String(raw.reason ?? "");
  const reason: PhotoDecisionReason =
    requested && reasonValue === "user_requested"
      ? "user_requested"
      : requested && reasonValue === "self_initiated"
        ? "self_initiated"
        : "none";
  const shouldSendPhoto = requested && reason !== "none";
  const framingValue = String(raw.intent?.framing ?? "");
  const framing = ["selfie", "mirror", "portrait", "upper_body", "full_body"].includes(framingValue)
    ? framingValue as PhotoFraming
    : "selfie";
  const suggestiveValue = String(raw.intent?.suggestiveLevel ?? "");
  const suggestiveLevel = ["none", "low", "medium", "high"].includes(suggestiveValue)
    ? suggestiveValue as PhotoSuggestiveLevel
    : "none";

  if (!shouldSendPhoto) return { shouldSendPhoto: false, reason: "none" };
  return {
    shouldSendPhoto: true,
    reason,
    caption: asOptionalString(raw.caption, 220),
    intent: {
      framing,
      mood: asOptionalString(raw.intent?.mood, 80) ?? "natural",
      pose: asOptionalString(raw.intent?.pose, 160) ?? "natural relaxed pose",
      location: asOptionalString(raw.intent?.location, 100) ?? "current location",
      outfit: asOptionalString(raw.intent?.outfit, 140) ?? "current outfit",
      suggestiveLevel,
    },
  };
}

function parseMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.replace(/\s+/gu, " ").trim();
    if (!text || text.length > 700) continue;
    result.push(text);
    if (result.length >= 3) break;
  }
  return result;
}

function responseReason(data: WorkerReply, status: number) {
  if (typeof data.reason === "string" && data.reason.trim()) return data.reason.trim().slice(0, 180);
  if (typeof data.error === "string" && data.error.trim()) return data.error.trim().slice(0, 180);
  return `worker-http-${status}`;
}

function bindAbort(source: AbortSignal | undefined, target: AbortController) {
  if (!source) return () => {};
  const abort = () => target.abort(source.reason);
  if (source.aborted) abort();
  else source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

function circuitDuration(status?: number) {
  if (status === 404) return NOT_FOUND_CIRCUIT_MS;
  if (status && status >= 400 && status < 500 && status !== 401) return 0;
  return TRANSIENT_CIRCUIT_MS;
}

async function acquireCloudTokens(
  user: { getIdToken: (forceRefresh?: boolean) => Promise<string> },
  forceRefresh: boolean,
  signal?: AbortSignal,
) {
  return Promise.all([
    bounded(
      user.getIdToken(forceRefresh),
      TOKEN_PREP_TIMEOUT_MS,
      "Firebase auth token",
      signal,
    ),
    bounded(
      getFirebaseAppCheckToken(forceRefresh),
      TOKEN_PREP_TIMEOUT_MS,
      "App Check token",
      signal,
    ),
  ]);
}

async function callLanguageWorker(
  input: CloudLanguageInput,
  idToken: string,
  appCheckToken: string,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const detachAbort = bindAbort(signal, controller);
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("cloud-language-timeout"));
  }, WORKER_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(runtimeCloudLanguageEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        "X-Firebase-AppCheck": appCheckToken,
      },
      body: JSON.stringify(input),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as WorkerReply;
    return { response, data };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    if (timedOut) throw new Error("cloud-language-timeout");
    throw error;
  } finally {
    window.clearTimeout(timeout);
    detachAbort();
  }
}

/**
 * v0.17: cloud is the normal dialogue path. Local dialogue is the resilient
 * fallback, not a router for "simple" messages. Only explicit silence stays local.
 */
export function shouldUseCloudLanguage(input: CloudLanguageInput) {
  if (input.silent) return false;
  if (input.mode === "initiative") return true;
  return Boolean(input.userText.trim());
}

export async function renderCloudLanguage(
  input: CloudLanguageInput,
  signal?: AbortSignal,
): Promise<CloudLanguageResult> {
  if (typeof window === "undefined") return { attempted: false, used: false, reason: "non-browser" };
  if (!isFirebaseConfigured) return { attempted: false, used: false, reason: "firebase-disabled" };
  if (!runtimeCloudLanguageEndpoint) return { attempted: false, used: false, reason: "worker-endpoint-missing" };
  if (!shouldUseCloudLanguage(input)) return { attempted: false, used: false, reason: "local-route" };
  if (Date.now() < unavailableUntil) return { attempted: false, used: false, reason: "circuit-open" };
  if (signal?.aborted) return { attempted: false, used: false, reason: "aborted" };

  const app = getFirebaseApp();
  if (!app) return { attempted: false, used: false, reason: "firebase-app-missing" };
  const user = getAuth(app).currentUser;
  if (!user) return { attempted: false, used: false, reason: "unauthenticated" };

  let idToken: string;
  let appCheckToken: string;
  try {
    [idToken, appCheckToken] = await acquireCloudTokens(user, false, signal);
  } catch (error) {
    if (signal?.aborted) return { attempted: true, used: false, reason: "aborted" };
    unavailableUntil = Date.now() + TRANSIENT_CIRCUIT_MS;
    return {
      attempted: true,
      used: false,
      reason: `token-prep: ${reasonFromError(error)}`.slice(0, 180),
    };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { response, data } = await callLanguageWorker(
        input,
        idToken,
        appCheckToken,
        signal,
      );
      if (signal?.aborted) return { attempted: true, used: false, reason: "aborted" };

      const model = typeof data.model === "string" ? data.model : undefined;
      const usage = parseUsage(data.usage);
      const budget = parseBudget(data.budget);
      const conversation = parseConversation(data.conversation);
      const signals = parseSignals(data.signals);
      const shouldInitiate = typeof data.shouldInitiate === "boolean" ? data.shouldInitiate : undefined;
      const emotionReaction = parseEmotionReaction(data.emotionReaction);
      const relationshipReaction = parseRelationshipReaction(data.relationshipReaction);
      const intimacyReaction = parseIntimacyReaction(data.intimacyReaction);
      const photoDecision = parsePhotoDecision(data.photoDecision);
      const reason = responseReason(data, response.status);

      // Firebase ID/App Check tokens can expire between acquisition and Worker
      // verification. Refresh both once before falling back to local dialogue.
      if (response.status === 401 && attempt === 0) {
        try {
          [idToken, appCheckToken] = await acquireCloudTokens(user, true, signal);
          continue;
        } catch (error) {
          if (signal?.aborted) return { attempted: true, used: false, reason: "aborted" };
          unavailableUntil = Date.now() + TRANSIENT_CIRCUIT_MS;
          return {
            attempted: true,
            used: false,
            reason: `token-refresh: ${reasonFromError(error)}`.slice(0, 180),
            model,
            usage,
            budget,
            conversation,
            signals,
            shouldInitiate,
            emotionReaction,
            relationshipReaction,
            intimacyReaction,
            photoDecision,
          };
        }
      }

      if (!response.ok) {
        const duration = circuitDuration(response.status);
        if (duration) unavailableUntil = Date.now() + duration;
        return { attempted: true, used: false, reason, model, usage, budget, conversation, signals, shouldInitiate, emotionReaction, relationshipReaction, intimacyReaction, photoDecision };
      }

      if (data.skipped === true) {
        if (/^(?:openai-timeout|openai-unavailable|openai-http-5\d\d)$/u.test(reason))
          unavailableUntil = Date.now() + TRANSIENT_CIRCUIT_MS;
        return {
          attempted: true,
          used: false,
          reason,
          model,
          usage,
          budget,
          conversation,
          signals,
          shouldInitiate,
          emotionReaction,
          relationshipReaction,
          intimacyReaction,
          photoDecision,
        };
      }

      const messages = parseMessages(data.messages);
      const legacyText = typeof data.text === "string" ? data.text.trim() : "";
      const text = messages.length ? messages.join("\n") : legacyText;
      if (input.mode === "initiative" && shouldInitiate === false) {
        unavailableUntil = 0;
        return {
          attempted: true,
          used: true,
          messages: [],
          shouldInitiate: false,
          model, usage, budget, conversation, signals,
          emotionReaction, relationshipReaction, intimacyReaction, photoDecision,
        };
      }
      if (!text || text.length > 1800 || looksLikeAssistantMeta(text)) {
        return {
          attempted: true,
          used: false,
          reason: text ? "rejected-cloud-text" : "empty-cloud-text",
          model,
          usage,
          budget,
          conversation,
          signals,
          shouldInitiate,
          emotionReaction,
          relationshipReaction,
          intimacyReaction,
          photoDecision,
        };
      }

      unavailableUntil = 0;
      return {
        attempted: true,
        used: true,
        text,
        messages: messages.length ? messages : [text],
        model,
        usage,
        budget,
        conversation,
        signals,
        shouldInitiate,
        emotionReaction,
        relationshipReaction,
        intimacyReaction,
        photoDecision,
      };
    } catch (error) {
      if (signal?.aborted) return { attempted: true, used: false, reason: "aborted" };
      unavailableUntil = Date.now() + TRANSIENT_CIRCUIT_MS;
      return { attempted: true, used: false, reason: reasonFromError(error) };
    }
  }

  return { attempted: true, used: false, reason: "cloud-language-unavailable" };
}
