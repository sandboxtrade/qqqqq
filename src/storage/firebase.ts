import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getToken,
  onTokenChanged,
  initializeAppCheck,
  setTokenAutoRefreshEnabled,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { getFirestore, type Firestore } from "firebase/firestore";
import {
  assertRuntimeConfiguration,
  firebaseMissingFields,
  isLocalRepositoryAllowed,
  runtimeAppCheckDebugEnabled,
  runtimeAppCheckDebugToken,
  runtimeConfigurationError,
  runtimeFirebaseConfig,
  runtimeRecaptchaEnterpriseSiteKey,
} from "../config/runtime-config";

import { bounded } from "../core/async";

export const firebaseConfig = runtimeFirebaseConfig;

export const isFirebaseConfigured = firebaseMissingFields.length === 0;
export { isLocalRepositoryAllowed, runtimeConfigurationError };
export const appCheckSiteKey = runtimeRecaptchaEnterpriseSiteKey;

export type AppCheckState =
  | "checking"
  | "disabled"
  | "missing_site_key"
  | "debug"
  | "active"
  | "throttled"
  | "error";


function appCheckErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String((error as { code?: unknown }).code ?? "");
}

function appCheckErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function isAppCheckThrottleError(error: unknown) {
  const code = appCheckErrorCode(error);
  const message = appCheckErrorMessage(error);
  return code === "appCheck/throttled" || code === "appCheck/initial-throttle" ||
    /appCheck\/(?:throttled|initial-throttle)|Requests throttled due to previous 403|403 error\. Attempts allowed again/iu.test(message);
}

export function isAppCheckAttestationError(error: unknown) {
  const code = appCheckErrorCode(error);
  const message = appCheckErrorMessage(error);
  return isAppCheckThrottleError(error) || code === "appCheck/fetch-status-error" ||
    /App attestation failed|PERMISSION_DENIED|fetch-status-error|\b403\b/iu.test(message);
}

function readableThrottleTime(message: string) {
  const match = message.match(/after\s+([0-9a-z:]+)/iu);
  return match?.[1] ?? "";
}

export function describeAppCheckError(error: unknown) {
  const message = appCheckErrorMessage(error);
  if (isAppCheckThrottleError(error)) {
    const wait = readableThrottleTime(message);
    return `[app-check-throttled] Firebase App Check ранее получил 403 и временно остановил повторные проверки${wait ? ` (${wait})` : ""}. Проверь регистрацию reCAPTCHA Enterprise key и домен sandboxtrade.github.io в Firebase/Google Cloud. После исправления конфигурации обнови страницу — ждать весь таймер обычно не нужно.`;
  }
  if (isAppCheckAttestationError(error)) {
    return "[app-check-rejected] Firebase App Check отклонил attestation (403). Проверь, что этот Web App зарегистрирован в App Check с тем же reCAPTCHA Enterprise site key, API reCAPTCHA Enterprise включён, а sandboxtrade.github.io разрешён у ключа.";
  }
  return message || "App Check token error";
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let appCheck: AppCheck | null = null;
let appCheckState: AppCheckState = isFirebaseConfigured
  ? "missing_site_key"
  : "disabled";

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  assertRuntimeConfiguration();
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function initializeFirebaseAppCheck(): AppCheckState {
  if (!isFirebaseConfigured) {
    appCheckState = "disabled";
    return appCheckState;
  }
  assertRuntimeConfiguration();
  if (appCheck) return appCheckState;
  if (!appCheckSiteKey) {
    appCheckState = "missing_site_key";
    return appCheckState;
  }

  try {
    if (runtimeAppCheckDebugToken || runtimeAppCheckDebugEnabled) {
      (
        globalThis as typeof globalThis & {
          FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
        }
      ).FIREBASE_APPCHECK_DEBUG_TOKEN = runtimeAppCheckDebugToken || true;
      appCheckState = "debug";
    } else {
      appCheckState = "checking";
    }

    const firebaseApp = getFirebaseApp();
    if (!firebaseApp) return "disabled";
    appCheck = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      // Start on-demand. This avoids a hidden background attestation turning
      // the first useful 403 into a secondary ~24h SDK throttle before the UI
      // can explain what failed. Auto-refresh is enabled after the first
      // successful token acquisition below.
      isTokenAutoRefreshEnabled: false,
    });
    onTokenChanged(appCheck, {
      next: (result) => {
        appCheckState = result.token
          ? runtimeAppCheckDebugEnabled || runtimeAppCheckDebugToken
            ? "debug"
            : "active"
          : "error";
      },
      error: (error) => {
        appCheckState = isAppCheckThrottleError(error) ? "throttled" : "error";
      },
    });
    return appCheckState;
  } catch {
    appCheckState = "error";
    return appCheckState;
  }
}

export function getAppCheckState(): AppCheckState {
  return appCheckState;
}

let pendingAppCheckToken: Promise<string> | null = null;
const APP_CHECK_READY_TIMEOUT_MS = 18_000;

export async function getFirebaseAppCheckToken(forceRefresh = false): Promise<string> {
  assertRuntimeConfiguration();
  initializeFirebaseAppCheck();
  if (!appCheck)
    throw new Error("App Check не настроен: проверь reCAPTCHA site key.");

  // Coalesce normal token requests. Dialogue, photos and Firestore bootstrap can
  // otherwise start the same reCAPTCHA Enterprise attestation simultaneously,
  // which is especially unreliable on slower mobile browsers.
  if (!forceRefresh && pendingAppCheckToken) return pendingAppCheckToken;
  const currentAppCheck = appCheck;
  const request = (async () => {
    try {
      const result = await getToken(currentAppCheck, forceRefresh);
      appCheckState = result.token
        ? runtimeAppCheckDebugEnabled || runtimeAppCheckDebugToken
          ? "debug"
          : "active"
        : "error";
      if (!result.token) throw new Error("App Check не вернул токен.");
      setTokenAutoRefreshEnabled(currentAppCheck, true);
      return result.token;
    } catch (error) {
      appCheckState = isAppCheckThrottleError(error) ? "throttled" : "error";
      throw new Error(describeAppCheckError(error));
    }
  })();

  if (!forceRefresh) pendingAppCheckToken = request;
  try {
    return await request;
  } finally {
    if (pendingAppCheckToken === request) pendingAppCheckToken = null;
  }
}

export function getFirebaseDb(): Firestore | null {
  if (!isFirebaseConfigured) return null;
  assertRuntimeConfiguration();
  if (!db) {
    const firebaseApp = getFirebaseApp();
    db = firebaseApp ? getFirestore(firebaseApp) : null;
  }
  return db;
}

export async function verifyAppCheck() {
  assertRuntimeConfiguration();
  await bounded(
    getFirebaseAppCheckToken(false),
    APP_CHECK_READY_TIMEOUT_MS,
    "App Check",
  );
}
