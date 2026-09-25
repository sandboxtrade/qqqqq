import { getAuth } from "firebase/auth";
import {
  getFirebaseApp,
  getFirebaseAppCheckToken,
  isFirebaseConfigured,
} from "../storage/firebase";
import { runtimeCloudLanguageEndpoint } from "../config/runtime-config";

export type CloudLanguageRole = "user" | "character";

export interface CloudLanguageInput {
  userText: string;
  intent: string;
  dialogueActs: readonly string[];
  goal: string;
  tone: string;
  length: string;
  sceneMechanic?: {
    mode: string;
    family?: string;
    step?: number;
    maxStep?: number;
    heat?: number;
  };
  semantic: {
    topic?: string;
    focus?: string;
    subject: string;
    stance: string;
    questionType?: string;
    isQuestion: boolean;
    reciprocal: boolean;
    asksCharacterView: boolean;
    wantsAdvice: boolean;
    wantsListening: boolean;
    confidence: number;
    appearanceRequest?: {
      requestedVibe: string;
      outcome: string;
      reason: string;
      selectedEmotion: string;
      suggestive: boolean;
    };
  };
  decision: {
    action: string;
    mode: string;
    stance: string;
    summary: string;
    locked: boolean;
    shouldAskFollowUp: boolean;
    shouldReferenceMemory: boolean;
  };
  continuity: {
    currentTopic?: string;
    previousTopic?: string;
    pendingQuestion?: string;
    previousUserText?: string;
    previousUserTextBeforeLast?: string;
    previousCharacterText?: string;
    previousCharacterTextBeforeLast?: string;
    lastUserIntent?: string;
    lastCharacterIntent?: string;
    lastCharacterTopic?: string;
    lastCharacterOpenThread?: string;
    lastCharacterContinuesPrevious?: boolean;
    turnsOnTopic: number;
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
  thought?: {
    observation?: string;
    interpretation?: string;
    feeling?: string;
    desire?: string;
    concern?: string;
    stance?: string;
    memoryEcho?: string;
    reconsideration?: string;
    relationalEmotion?: string;
    relationalReflection?: string;
    retrospectiveEcho?: string;
  };
  /** Recent chronological surface dialogue. The current user message is sent separately. */
  recentHistory: Array<{ role: CloudLanguageRole; text: string }>;
  /** Older lines selected by the local retrospective/retrieval pass. */
  recoveredHistory?: Array<{ role: CloudLanguageRole; text: string }>;
  memories: Array<{
    summary: string;
    kind: string;
    importance: number;
    emotionalWeight: number;
    confidence: number;
    retrievalStrength: number;
  }>;
  facts: Array<{
    statement: string;
    subject: string;
    confidence: number;
  }>;
  openThreads: Array<{
    summary: string;
    priority: number;
  }>;
  retrospective?: string;
  causal: string[];
  locked: boolean;
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
  openThread?: string;
}

export interface CloudLanguageSignals {
  userTone?: string;
  relationshipEvent?: string;
  memoryUsed?: boolean;
  emotionTone?: string;
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
    openThread?: unknown;
  };
  signals?: {
    userTone?: unknown;
    relationshipEvent?: unknown;
    memoryUsed?: unknown;
    emotionTone?: unknown;
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

const CALL_TIMEOUT_MS = 11_000;
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
    openThread: asOptionalString(raw.openThread, 180),
  };
}

function parseSignals(raw: WorkerReply["signals"]): CloudLanguageSignals | undefined {
  if (!raw) return undefined;
  return {
    userTone: asOptionalString(raw.userTone, 32),
    relationshipEvent: asOptionalString(raw.relationshipEvent, 32),
    memoryUsed: typeof raw.memoryUsed === "boolean" ? raw.memoryUsed : undefined,
    emotionTone: asOptionalString(raw.emotionTone, 32),
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

/**
 * v0.17: cloud is the normal dialogue path. Local dialogue is the resilient
 * fallback, not a router for "simple" messages. Only explicit silence stays local.
 */
export function shouldUseCloudLanguage(input: CloudLanguageInput) {
  if (input.silent) return false;
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

  const controller = new AbortController();
  const detachAbort = bindAbort(signal, controller);
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("cloud-language-timeout"));
  }, CALL_TIMEOUT_MS);

  try {
    const [idToken, appCheckToken] = await Promise.all([
      user.getIdToken(false),
      getFirebaseAppCheckToken(false),
    ]);
    if (controller.signal.aborted) {
      return { attempted: false, used: false, reason: signal?.aborted ? "aborted" : "cloud-language-timeout" };
    }

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
    if (signal?.aborted) return { attempted: true, used: false, reason: "aborted" };

    const model = typeof data.model === "string" ? data.model : undefined;
    const usage = parseUsage(data.usage);
    const budget = parseBudget(data.budget);
    const conversation = parseConversation(data.conversation);
    const signals = parseSignals(data.signals);

    if (!response.ok) {
      const reason = responseReason(data, response.status);
      unavailableUntil = Date.now() + (response.status === 404 ? 10 * 60_000 : 30_000);
      return { attempted: true, used: false, reason, model, usage, budget, conversation, signals };
    }

    if (data.skipped === true) {
      return {
        attempted: true,
        used: false,
        reason: responseReason(data, response.status),
        model,
        usage,
        budget,
        conversation,
        signals,
      };
    }

    const messages = parseMessages(data.messages);
    const legacyText = typeof data.text === "string" ? data.text.trim() : "";
    const text = messages.length ? messages.join("\n") : legacyText;
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
      };
    }

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
    };
  } catch (error) {
    if (signal?.aborted) return { attempted: true, used: false, reason: "aborted" };
    const reason = timedOut ? "cloud-language-timeout" : reasonFromError(error);
    unavailableUntil = Date.now() + 30_000;
    return { attempted: true, used: false, reason };
  } finally {
    window.clearTimeout(timeout);
    detachAbort();
  }
}
