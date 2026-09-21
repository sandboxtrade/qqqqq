import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getFirestore, type Firestore } from 'firebase/firestore';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
export const appCheckSiteKey = String(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ?? '').trim();

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
    const debugToken = String(env.VITE_APP_CHECK_DEBUG_TOKEN ?? '').trim();
    const debugEnabled = String(env.VITE_APP_CHECK_DEBUG ?? '').toLowerCase() === 'true';
    if (debugToken || debugEnabled) {
      // Firebase reads this global before App Check initialization.
      (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true;
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
