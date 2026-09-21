import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  runtimeAppCheckDebugEnabled,
  runtimeAppCheckDebugToken,
  runtimeFirebaseConfig,
  runtimeRecaptchaEnterpriseSiteKey,
} from '../config/runtime-config';

export const firebaseConfig = runtimeFirebaseConfig;

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
export const appCheckSiteKey = runtimeRecaptchaEnterpriseSiteKey;

export type AppCheckState = 'disabled' | 'missing_site_key' | 'debug' | 'active' | 'error';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let appCheck: AppCheck | null = null;
let appCheckState: AppCheckState = isFirebaseConfigured ? 'missing_site_key' : 'disabled';

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function initializeFirebaseAppCheck(): AppCheckState {
  if (!isFirebaseConfigured) {
    appCheckState = 'disabled';
    return appCheckState;
  }
  if (appCheck) return appCheckState;
  if (!appCheckSiteKey) {
    appCheckState = 'missing_site_key';
    return appCheckState;
  }

  try {
    if (runtimeAppCheckDebugToken || runtimeAppCheckDebugEnabled) {
      (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        runtimeAppCheckDebugToken || true;
      appCheckState = 'debug';
    } else {
      appCheckState = 'active';
    }

    const firebaseApp = getFirebaseApp();
    if (!firebaseApp) return 'disabled';
    appCheck = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return appCheckState;
  } catch {
    appCheckState = 'error';
    return appCheckState;
  }
}

export function getAppCheckState(): AppCheckState {
  return appCheckState;
}

export function getFirebaseDb(): Firestore | null {
  if (!isFirebaseConfigured) return null;
  if (!db) {
    const firebaseApp = getFirebaseApp();
    db = firebaseApp ? getFirestore(firebaseApp) : null;
  }
  return db;
}
