import { getAuth } from "firebase/auth";
import { runtimeCloudLanguageEndpoint } from "../config/runtime-config";
import { bounded } from "../core/async";
import { getFirebaseApp, getFirebaseAppCheckToken, isFirebaseConfigured } from "../storage/firebase";
import type { CloudLanguageSignals, CloudPhotoDecision, CloudPhotoIntent } from "./cloud-language";
import type { CharacterVisualProfile } from "../character/character-registry";

export interface CloudPhotoInput {
  character: {
    id: string;
    name: string;
    age: number;
  };
  visualProfile: CharacterVisualProfile;
  decision: CloudPhotoDecision;
  world?: {
    timeOfDay?: string;
    location?: string;
    activity?: string;
    availability?: string;
  };
  relationship?: {
    stage?: string;
    closeness?: number;
    trust?: number;
  };
  signals?: Pick<CloudLanguageSignals, "emotionTone" | "intimacyTone">;
}

export interface CloudPhotoUsage {
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  estimatedCostUsd?: number;
}

export interface CloudPhotoResult {
  attempted: boolean;
  used: boolean;
  dataUrl?: string;
  mimeType?: string;
  model?: string;
  prompt?: string;
  usage?: CloudPhotoUsage;
  reason?: string;
}

interface WorkerPhotoReply {
  ok?: unknown;
  skipped?: unknown;
  reason?: unknown;
  error?: unknown;
  dataUrl?: unknown;
  mimeType?: unknown;
  model?: unknown;
  prompt?: unknown;
  usage?: {
    inputTokens?: unknown;
    outputTokens?: unknown;
    imageCount?: unknown;
    estimatedCostUsd?: unknown;
  };
}

const WORKER_TIMEOUT_MS = 45_000;
const TOKEN_TIMEOUT_MS = 4_000;

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function workerPhotoEndpoint() {
  const base = runtimeCloudLanguageEndpoint.trim();
  return base.endsWith("/yuzukiSpeak")
    ? `${base.slice(0, -"/yuzukiSpeak".length)}/yuzukiPhoto`
    : `${base.replace(/\/+$/u, "")}/yuzukiPhoto`;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseUsage(raw: WorkerPhotoReply["usage"]) {
  if (!raw) return undefined;
  return {
    inputTokens: asNumber(raw.inputTokens),
    outputTokens: asNumber(raw.outputTokens),
    imageCount: asNumber(raw.imageCount),
    estimatedCostUsd: asNumber(raw.estimatedCostUsd),
  } satisfies CloudPhotoUsage;
}

function reasonFrom(data: WorkerPhotoReply, status: number) {
  const fromBody = firstString(data.reason, data.error);
  return fromBody || `photo-worker-http-${status}`;
}

function bindAbort(source: AbortSignal | undefined, target: AbortController) {
  if (!source) return () => {};
  const abort = () => target.abort(source.reason);
  if (source.aborted) abort();
  else source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

async function acquireTokens(
  user: { getIdToken: (forceRefresh?: boolean) => Promise<string> },
  forceRefresh: boolean,
  signal?: AbortSignal,
) {
  return Promise.all([
    bounded(user.getIdToken(forceRefresh), TOKEN_TIMEOUT_MS, "Firebase auth token", signal),
    bounded(getFirebaseAppCheckToken(forceRefresh), TOKEN_TIMEOUT_MS, "App Check token", signal),
  ]);
}

function normalizedDecision(decision: CloudPhotoDecision): CloudPhotoDecision {
  return decision.shouldSendPhoto && decision.intent
    ? {
        shouldSendPhoto: true,
        reason: decision.reason === "self_initiated" ? "self_initiated" : "user_requested",
        caption: decision.caption,
        intent: decision.intent,
      }
    : { shouldSendPhoto: false, reason: "none" };
}

export async function generateCloudPhoto(input: CloudPhotoInput, signal?: AbortSignal): Promise<CloudPhotoResult> {
  if (!isFirebaseConfigured) return { attempted: false, used: false, reason: "firebase-not-configured" };
  if (!input.decision.shouldSendPhoto || !input.decision.intent) {
    return { attempted: false, used: false, reason: "photo-not-requested" };
  }

  const app = getFirebaseApp();
  if (!app) return { attempted: false, used: false, reason: "firebase-app-missing" };
  const auth = getAuth(app);
  if (!auth.currentUser) return { attempted: false, used: false, reason: "not-authenticated" };

  let idToken = "";
  let appCheckToken = "";
  try {
    [idToken, appCheckToken] = await acquireTokens(auth.currentUser, false, signal);
  } catch {
    [idToken, appCheckToken] = await acquireTokens(auth.currentUser, true, signal);
  }

  const controller = new AbortController();
  const detach = bindAbort(signal, controller);
  const timeout = window.setTimeout(() => controller.abort(new Error("photo-worker-timeout")), WORKER_TIMEOUT_MS);
  try {
    const response = await fetch(workerPhotoEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        "X-Firebase-AppCheck": appCheckToken,
      },
      body: JSON.stringify({
        ...input,
        decision: normalizedDecision(input.decision),
      }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as WorkerPhotoReply;
    if (!response.ok) {
      return { attempted: true, used: false, reason: reasonFrom(data, response.status) };
    }
    if (data.skipped === true || data.ok !== true) {
      return { attempted: true, used: false, reason: reasonFrom(data, response.status) };
    }
    const dataUrl = firstString(data.dataUrl);
    const mimeType = firstString(data.mimeType) || "image/webp";
    if (!dataUrl) return { attempted: true, used: false, reason: "photo-empty" };
    return {
      attempted: true,
      used: true,
      dataUrl,
      mimeType,
      model: firstString(data.model),
      prompt: firstString(data.prompt),
      usage: parseUsage(data.usage),
    };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return {
      attempted: true,
      used: false,
      reason: error instanceof Error ? error.message : "photo-worker-unavailable",
    };
  } finally {
    window.clearTimeout(timeout);
    detach();
  }
}
