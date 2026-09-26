import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getToken,
  onTokenChanged,
  initializeAppCheck,
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
  | "error";

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
      isTokenAutoRefreshEnabled: true,
    });
    onTokenChanged(appCheck, {
      next: (result) => {
        appCheckState = result.token
          ? runtimeAppCheckDebugEnabled || runtimeAppCheckDebugToken
            ? "debug"
            : "active"
          : "error";
      },
      error: () => {
        appCheckState = "error";
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

export async function getFirebaseAppCheckToken(forceRefresh = false): Promise<string> {
  assertRuntimeConfiguration();
  initializeFirebaseAppCheck();
  if (!appCheck)
    throw new Error("App Check не настроен: проверь reCAPTCHA site key.");
  const result = await getToken(appCheck, forceRefresh);
  appCheckState = result.token
    ? runtimeAppCheckDebugEnabled || runtimeAppCheckDebugToken
      ? "debug"
      : "active"
    : "error";
  if (!result.token) throw new Error("App Check не вернул токен.");
  return result.token;
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

let pendingToken: Promise<void> | null = null;

export async function verifyAppCheck() {
  assertRuntimeConfiguration();
  initializeFirebaseAppCheck();
  if (!appCheck)
    throw new Error("App Check не настроен: проверь reCAPTCHA site key.");
  if (!pendingToken) {
    const request = bounded(getToken(appCheck, false), 6000, "App Check").then(() => {});
    pendingToken = request;
    void request.then(() => { if (pendingToken === request) pendingToken = null; },
      () => { if (pendingToken === request) pendingToken = null; });
  }
  await pendingToken;
}
