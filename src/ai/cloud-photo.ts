import { getAuth } from "firebase/auth";
import { runtimeCloudLanguageEndpoint } from "../config/runtime-config";
import type { PhotoTask } from "../storage/photo-jobs";
import { bounded } from "../core/async";
import {
  getFirebaseApp,
  getFirebaseAppCheckToken,
  isAppCheckAttestationError,
  isFirebaseConfigured,
} from "../storage/firebase";
import type { CloudLanguageSignals, CloudPhotoDecision } from "./cloud-language";
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
  provider?: "openai" | "wavespeed";
  providerTaskId?: string;
  primaryFailure?: string;
  primaryDetail?: string;
  detail?: string;
  reason?: string;
}

interface WorkerPhotoReply {
  ok?: unknown;
  skipped?: unknown;
  pending?: unknown;
  ready?: unknown;
  reason?: unknown;
  error?: unknown;
  detail?: unknown;
  dataUrl?: unknown;
  mimeType?: unknown;
  model?: unknown;
  provider?: unknown;
  providerTaskId?: unknown;
  taskToken?: string;
  credentialFailure?: unknown;
  retryWithNextKey?: unknown;
  credentialAttempt?: unknown;
  credentialCount?: unknown;
  primaryFailure?: unknown;
  primaryDetail?: unknown;
  prompt?: unknown;
  usage?: {
    inputTokens?: unknown;
    outputTokens?: unknown;
    imageCount?: unknown;
    estimatedCostUsd?: unknown;
  };
}

// Z-Image Turbo LoRA is asynchronous. Submit waits for a prediction id,
// then result polling continues without creating a second billed task.
const PHOTO_START_TIMEOUT_MS = 65_000;
// Count completed polls instead of using a wall-clock deadline. Mobile Safari
// can suspend timers while backgrounded; a wall-clock timeout used to mark an
// otherwise healthy WaveSpeed job as failed immediately after the app resumed.
const WAVESPEED_POLL_INTERVAL_MS = 5_000;
const WAVESPEED_MAX_POLL_ATTEMPTS = 96;
// The Worker may retry downloading an already-completed CDN image several
// times. Give that recovery path enough room to return instead of aborting the
// client request halfway through a successful recovery.
const POLL_REQUEST_TIMEOUT_MS = 70_000;
const WAVESPEED_KEY_RETRY_START_TIMEOUT_MS = 35_000;
const TOKEN_TIMEOUT_MS = 18_000;

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

function workerPhotoResultEndpoint() {
  return workerPhotoEndpoint().replace(/\/yuzukiPhoto$/u, "/yuzukiPhotoResult");
}
function workerPhotoAssetEndpoint() {
  return workerPhotoEndpoint().replace(/\/yuzukiPhoto$/u, "/yuzukiPhotoAsset");
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
  const fromBody = firstString(data.reason, data.error, data.detail);
  return fromBody || `photo-worker-http-${status}`;
}

export function isWaveSpeedBalanceFailureText(...values: unknown[]) {
  const text = values
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();
  const balanceFailure = /top[ -]?up|insufficient (?:balance|credit|credits|funds)|low balance|out of (?:credit|credits)|balance.*required|credit.*required|payment required|billing/;
  if (!text.includes("wavespeed") && !balanceFailure.test(text)) return false;
  return balanceFailure.test(text);
}

export class CloudPhotoGenerationError extends Error {
  reason?: string;
  detail?: string;
  provider?: "openai" | "wavespeed";
  primaryFailure?: string;
  primaryDetail?: string;
  constructor(result: Pick<CloudPhotoResult, "reason" | "detail" | "provider" | "primaryFailure" | "primaryDetail">) {
    super(result.detail || result.primaryDetail || result.reason || "photo-generation-failed");
    this.name = "CloudPhotoGenerationError";
    this.reason = result.reason;
    this.detail = result.detail;
    this.provider = result.provider;
    this.primaryFailure = result.primaryFailure;
    this.primaryDetail = result.primaryDetail;
  }
}

export function isWaveSpeedBalanceFailureError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as Partial<CloudPhotoGenerationError> & { message?: unknown };
  return isWaveSpeedBalanceFailureText(maybe.reason, maybe.detail, maybe.primaryFailure, maybe.primaryDetail, maybe.message);
}

function bindAbort(source: AbortSignal | undefined, target: AbortController) {
  if (!source) return () => {};
  const abort = () => target.abort(source.reason);
  if (source.aborted) abort();
  else source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

async function requestWaveSpeedKeyRetry(
  taskId: string,
  activeModel: string,
  idToken: string,
  appCheckToken: string,
  initial: WorkerPhotoReply,
  input: CloudPhotoInput,
  signal?: AbortSignal,
): Promise<CloudPhotoResult | { nextTaskId: string; nextInitial: WorkerPhotoReply } | null> {
  const retryController = new AbortController();
  const detachRetry = bindAbort(signal, retryController);
  const retryTimeout = window.setTimeout(
    () => retryController.abort(new Error("photo-key-retry-start-timeout")),
    WAVESPEED_KEY_RETRY_START_TIMEOUT_MS,
  );
  try {
    const retryResponse = await fetch(workerPhotoEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        "X-Firebase-AppCheck": appCheckToken,
      },
      body: JSON.stringify({
        ...input,
        decision: normalizedDecision(input.decision),
        retryWaveSpeedModel: activeModel,
        retryWaveSpeedTaskId: taskId,
        taskToken: initial.taskToken,
        retryWaveSpeedCredentialAttempt: asNumber(initial.credentialAttempt),
      }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: retryController.signal,
    });
    const retryData = (await retryResponse.json().catch(() => ({}))) as WorkerPhotoReply;
    if (!retryResponse.ok || retryData.skipped === true || retryData.ok !== true) return null;

    const recoveredDataUrl = firstString(retryData.dataUrl);
    if (recoveredDataUrl) {
      return {
        attempted: true,
        used: true,
        dataUrl: recoveredDataUrl,
        mimeType: firstString(retryData.mimeType) || "image/webp",
        model: firstString(retryData.model, activeModel),
        provider: "wavespeed",
        providerTaskId: firstString(retryData.providerTaskId, taskId),
        primaryFailure: firstString(initial.primaryFailure) || undefined,
        primaryDetail: firstString(initial.primaryDetail) || undefined,
        prompt: firstString(retryData.prompt, initial.prompt),
        usage: parseUsage(retryData.usage) ?? parseUsage(initial.usage),
      };
    }

    const retryTaskId = firstString(retryData.providerTaskId);
    if (retryData.pending === true && retryData.provider === "wavespeed" && retryTaskId) {
      const retryModel = firstString(retryData.model, activeModel);
      if (retryTaskId === taskId && retryModel === activeModel) return null;
      return {
        nextTaskId: retryTaskId,
        nextInitial: {
          ...initial,
          ...retryData,
          primaryFailure: firstString(initial.primaryFailure, retryData.primaryFailure) || undefined,
          primaryDetail: firstString(initial.primaryDetail, retryData.primaryDetail) || undefined,
          prompt: firstString(retryData.prompt, initial.prompt) || undefined,
        },
      };
    }
    return null;
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return null;
  } finally {
    window.clearTimeout(retryTimeout);
    detachRetry();
  }
}

async function acquireTokens(
  user: { getIdToken: (forceRefresh?: boolean) => Promise<string> },
  options: { forceAuth?: boolean; forceAppCheck?: boolean } = {},
  signal?: AbortSignal,
) {
  return Promise.all([
    bounded(user.getIdToken(options.forceAuth === true), TOKEN_TIMEOUT_MS, "Firebase auth token", signal),
    bounded(getFirebaseAppCheckToken(options.forceAppCheck === true), TOKEN_TIMEOUT_MS, "App Check token", signal),
  ]);
}

function normalizedDecision(decision: CloudPhotoDecision): CloudPhotoDecision {
  return decision.shouldSendPhoto && decision.intent
    ? {
        shouldSendPhoto: true,
        reason: decision.reason === "self_initiated" ? "self_initiated" : "user_requested",
        caption: decision.caption,
        prompt: decision.prompt,
        authorization: decision.authorization,
        intent: decision.intent,
      }
    : { shouldSendPhoto: false, reason: "none" };
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = window.setTimeout(finish, ms);
    const abort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new Error("aborted"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Fetch the already-generated photo as bytes, avoiding large base64 JSON
 * responses in Safari. Retries never submit a new paid WaveSpeed prediction. */
async function fetchFinishedImage(
  taskId: string,
  taskToken: string,
  idToken: string,
  appCheckToken: string,
  signal?: AbortSignal,
): Promise<{ dataUrl: string; mimeType: string }> {
  let lastFailure = "photo-asset-unavailable";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(attempt * 3000, signal);
    const controller = new AbortController();
    const detach = bindAbort(signal, controller);
    const timeout = window.setTimeout(() => controller.abort(new Error("photo-asset-timeout")), 45_000);
    try {
      const response = await fetch(workerPhotoAssetEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
          "X-Firebase-AppCheck": appCheckToken,
        },
        body: JSON.stringify({ taskId, taskToken }),
        cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as WorkerPhotoReply;
        lastFailure = reasonFrom(error, response.status);
        if (response.status === 401 || response.status === 403 || response.status === 400) break;
        continue;
      }
      const mimeType = (response.headers.get("Content-Type") || "").split(";")[0].trim();
      if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
        lastFailure = "photo-asset-invalid-mime";
        continue;
      }
      const blob = await response.blob();
      if (!blob.size || blob.size > 14_000_000) {
        lastFailure = "photo-asset-invalid-size";
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("photo-file-reader-error"));
        reader.readAsDataURL(blob);
      });
      if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
        lastFailure = "photo-asset-invalid-data";
        continue;
      }
      return { dataUrl, mimeType };
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      lastFailure = error instanceof Error ? error.message : "photo-asset-load-failed";
    } finally {
      window.clearTimeout(timeout);
      detach();
    }
  }
  throw new Error(`Не удалось загрузить уже созданное фото (${lastFailure}). Повторное получение не создаст новую генерацию.`);
}

async function pollWaveSpeedPhoto(
  taskId: string,
  idToken: string,
  appCheckToken: string,
  initial: WorkerPhotoReply,
  input: CloudPhotoInput,
  signal?: AbortSignal,
  onTask?: (task: PhotoTask) => void,
): Promise<CloudPhotoResult> {
  let lastReason = "wavespeed-pending";
  let pollContext = initial;
  let refreshedAuth = false;
  for (let attempt = 0; attempt < WAVESPEED_MAX_POLL_ATTEMPTS; attempt += 1) {
    await sleep(WAVESPEED_POLL_INTERVAL_MS, signal);
    const controller = new AbortController();
    const detach = bindAbort(signal, controller);
    const timeout = window.setTimeout(
      () => controller.abort(new Error("photo-result-poll-timeout")),
      POLL_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(workerPhotoResultEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
          "X-Firebase-AppCheck": appCheckToken,
        },
        body: JSON.stringify({
          taskId,
          taskToken: pollContext.taskToken,
          model: firstString(pollContext.model) || undefined,
          credentialAttempt: asNumber(pollContext.credentialAttempt),
        }),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as WorkerPhotoReply;
      pollContext = { ...pollContext, ...data };
      if (!response.ok) {
        if (response.status === 401 && !refreshedAuth) {
          const app = getFirebaseApp();
          const user = app ? getAuth(app).currentUser : null;
          if (user) {
            [idToken, appCheckToken] = await acquireTokens(user, { forceAuth: true }, signal);
            refreshedAuth = true;
            continue;
          }
        }
        lastReason = reasonFrom(data, response.status);
        if (response.status >= 500 || response.status === 429) continue;
        return { attempted: true, used: false, provider: "wavespeed", providerTaskId: taskId, reason: lastReason };
      }
      if (data.pending === true) {
        lastReason = firstString(data.reason) || "wavespeed-pending";
        continue;
      }
      if (data.ok === true && data.ready === true && pollContext.taskToken) {
        // Task is paid and completed. Download it in a separate binary request.
        // If Safari interrupts transfer, keep the prediction ID in the journal.
        try {
          const image = await fetchFinishedImage(taskId, pollContext.taskToken, idToken, appCheckToken, signal);
          return {
            attempted: true, used: true,
            dataUrl: image.dataUrl, mimeType: image.mimeType,
            model: firstString(data.model, pollContext.model), provider: "wavespeed",
            providerTaskId: taskId,
            prompt: firstString(pollContext.prompt),
          };
        } catch (error) {
          if (signal?.aborted) throw signal.reason ?? error;
          return {
            attempted: true, used: false, provider: "wavespeed",
            providerTaskId: taskId,
            reason: "photo-asset-download-failed",
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }
      const dataUrl = firstString(data.dataUrl);
      if (data.ok === true && dataUrl) {
        return {
          attempted: true,
          used: true,
          dataUrl,
          mimeType: firstString(data.mimeType) || "image/webp",
          model: firstString(data.model, pollContext.model),
          provider: "wavespeed",
          providerTaskId: firstString(data.providerTaskId, taskId),
          primaryFailure: firstString(data.primaryFailure, pollContext.primaryFailure) || undefined,
          primaryDetail: firstString(data.primaryDetail, pollContext.primaryDetail) || undefined,
          prompt: firstString(pollContext.prompt),
          usage: parseUsage(data.usage) ?? parseUsage(pollContext.usage),
        };
      }
      const terminalReason = reasonFrom(data, response.status);
      const activeModel = firstString(data.model, pollContext.model);
      if (data.retryWithNextKey === true) {
        const keyRetry = await requestWaveSpeedKeyRetry(
          taskId,
          activeModel,
          idToken,
          appCheckToken,
          pollContext,
          input,
          signal,
        );
        if (keyRetry && "nextTaskId" in keyRetry) {
          onTask?.({ ...keyRetry.nextInitial, providerTaskId: keyRetry.nextTaskId } as PhotoTask);
          return pollWaveSpeedPhoto(keyRetry.nextTaskId, idToken, appCheckToken, keyRetry.nextInitial, input, signal, onTask);
        }
        if (keyRetry) return keyRetry;
      }

      return {
        attempted: true,
        used: false,
        provider: "wavespeed",
        providerTaskId: taskId,
        primaryFailure: firstString(pollContext.primaryFailure) || undefined,
        primaryDetail: firstString(pollContext.primaryDetail) || undefined,
        detail: firstString(data.detail) || undefined,
        reason: terminalReason,
      };
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      lastReason = error instanceof Error ? error.message : "photo-result-poll-failed";
      // A single lost poll must not throw away an already running WaveSpeed job.
      continue;
    } finally {
      window.clearTimeout(timeout);
      detach();
    }
  }
  return {
    attempted: true,
    used: false,
    provider: "wavespeed",
    providerTaskId: taskId,
    reason: lastReason === "wavespeed-pending" ? "wavespeed-poll-attempts-exhausted" : lastReason,
  };
}

export async function generateCloudPhoto(input: CloudPhotoInput, signal?: AbortSignal, options: { resume?: PhotoTask; onTask?: (task: PhotoTask) => void } = {}): Promise<CloudPhotoResult> {
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
    [idToken, appCheckToken] = await acquireTokens(auth.currentUser, {}, signal);
  } catch (error) {
    // A 403/throttle is an attestation/configuration problem, not an expired
    // token. Forcing another App Check exchange only repeats the rejection and
    // can extend noisy retry loops. Let the caller surface the real diagnosis.
    if (isAppCheckAttestationError(error)) {
      return {
        attempted: true,
        used: false,
        reason: error instanceof Error ? error.message : "app-check-rejected",
      };
    }
    [idToken, appCheckToken] = await acquireTokens(
      auth.currentUser,
      { forceAuth: true },
      signal,
    );
  }

  if (options.resume) {
    return pollWaveSpeedPhoto(options.resume.providerTaskId, idToken, appCheckToken, options.resume, input, signal, options.onTask);
  }

  const controller = new AbortController();
  const detach = bindAbort(signal, controller);
  const timeout = window.setTimeout(() => controller.abort(new Error("photo-worker-timeout")), PHOTO_START_TIMEOUT_MS);
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
      return {
        attempted: true,
        used: false,
        provider: data.provider === "wavespeed" ? "wavespeed" : data.provider === "openai" ? "openai" : undefined,
        primaryFailure: firstString(data.primaryFailure) || undefined,
        primaryDetail: firstString(data.primaryDetail) || undefined,
        detail: firstString(data.detail) || undefined,
        reason: reasonFrom(data, response.status),
      };
    }
    if (data.skipped === true || data.ok !== true) {
      return {
        attempted: true,
        used: false,
        provider: data.provider === "wavespeed" ? "wavespeed" : data.provider === "openai" ? "openai" : undefined,
        primaryFailure: firstString(data.primaryFailure) || undefined,
        primaryDetail: firstString(data.primaryDetail) || undefined,
        detail: firstString(data.detail) || undefined,
        reason: reasonFrom(data, response.status),
      };
    }

    const providerTaskId = firstString(data.providerTaskId);
    if (data.pending === true && data.provider === "wavespeed" && providerTaskId) {
      window.clearTimeout(timeout);
      detach();
      options.onTask?.({ providerTaskId, taskToken: data.taskToken, model: firstString(data.model), credentialAttempt: asNumber(data.credentialAttempt), prompt: firstString(data.prompt) });
      return pollWaveSpeedPhoto(providerTaskId, idToken, appCheckToken, data, input, signal, options.onTask);
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
      provider: data.provider === "wavespeed" ? "wavespeed" : data.provider === "openai" ? "openai" : undefined,
      providerTaskId: providerTaskId || undefined,
      primaryFailure: firstString(data.primaryFailure) || undefined,
      primaryDetail: firstString(data.primaryDetail) || undefined,
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
