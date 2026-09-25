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
  localDraft: string;
  intent: string;
  dialogueActs: readonly string[];
  goal: string;
  tone: string;
  length: string;
  relationship: {
    stage: string;
    trust: number;
    closeness: number;
    attachment: number;
    security: number;
    unresolvedTension: number;
  };
  emotion: {
    mood: number;
    happiness: number;
    sadness: number;
    irritation: number;
    anxiety: number;
    affection: number;
    curiosity: number;
    romanticInterest: number;
  };
  romancePhase?: string;
  intimacy?: {
    enabled: boolean;
    phase: string;
    comfort: number;
    interest: number;
    arousal: number;
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
  recentHistory: Array<{ role: CloudLanguageRole; text: string }>;
  memories: string[];
  facts: string[];
  openThreads: string[];
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

export interface CloudLanguageResult {
  attempted: boolean;
  used: boolean;
  text?: string;
  model?: string;
  usage?: CloudLanguageUsage;
  budget?: CloudLanguageBudget;
  reason?: string;
}

interface WorkerReply {
  text?: unknown;
  model?: unknown;
  skipped?: unknown;
  reason?: unknown;
  error?: unknown;
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

const CALL_TIMEOUT_MS = 10_000;
const SIMPLE_LOCAL_INTENTS = new Set([
  "greeting",
  "farewell",
  "thanks",
  "good_morning",
  "good_night",
  "acknowledgement",
  "short_yes",
  "short_no",
]);

let unavailableUntil = 0;

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function reasonFromError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return raw.replace(/\s+/gu, " ").trim().slice(0, 180) || "cloud-language-error";
}

function looksLikeAssistantMeta(text: string) {
  return /(?:как\s+(?:ии|ai)|я\s+(?:не\s+могу|не\s+имею\s+возможности)|openai|языков(?:ая|ой)\s+модел|политик(?:а|и)\s+безопасности|system\s+prompt)/iu.test(text);
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

export function shouldUseCloudLanguage(input: CloudLanguageInput) {
  if (input.silent) return false;
  if (!input.userText.trim() || !input.localDraft.trim()) return false;
  if (SIMPLE_LOCAL_INTENTS.has(input.intent) && input.userText.trim().length < 80)
    return false;
  // Very private/high-intimacy turns stay fully local. Besides preserving the
  // character's existing intimacy rules, this prevents a cloud wording layer
  // from becoming a dependency for Adult Mode.
  if (input.intimacy?.enabled && ["intimate", "high_intimacy"].includes(input.intimacy.phase))
    return false;
  return true;
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

    if (!response.ok) {
      const reason = responseReason(data, response.status);
      unavailableUntil = Date.now() + (response.status === 404 ? 10 * 60_000 : 45_000);
      return { attempted: true, used: false, reason, model, usage, budget };
    }

    if (data.skipped === true) {
      return {
        attempted: true,
        used: false,
        reason: responseReason(data, response.status),
        model,
        usage,
        budget,
      };
    }

    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (!text || text.length > 1400 || looksLikeAssistantMeta(text)) {
      return {
        attempted: true,
        used: false,
        reason: text ? "rejected-cloud-text" : "empty-cloud-text",
        model,
        usage,
        budget,
      };
    }

    return {
      attempted: true,
      used: true,
      text,
      model,
      usage,
      budget,
    };
  } catch (error) {
    if (signal?.aborted) return { attempted: true, used: false, reason: "aborted" };
    const reason = timedOut ? "cloud-language-timeout" : reasonFromError(error);
    unavailableUntil = Date.now() + 45_000;
    return { attempted: true, used: false, reason };
  } finally {
    window.clearTimeout(timeout);
    detachAbort();
  }
}
