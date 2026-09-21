export interface RuntimeFirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export interface RuntimeConfig {
  firebase?: RuntimeFirebaseConfig;
  recaptchaEnterpriseSiteKey?: string;
  geminiModel?: string;
}

declare global {
  interface Window {
    __VC_CONFIG__?: RuntimeConfig;
  }
}

const runtime = typeof window !== 'undefined' ? window.__VC_CONFIG__ : undefined;
const env = import.meta.env;

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export const runtimeFirebaseConfig = {
  apiKey: firstString(env.VITE_FIREBASE_API_KEY, runtime?.firebase?.apiKey),
  authDomain: firstString(env.VITE_FIREBASE_AUTH_DOMAIN, runtime?.firebase?.authDomain),
  projectId: firstString(env.VITE_FIREBASE_PROJECT_ID, runtime?.firebase?.projectId),
  storageBucket: firstString(env.VITE_FIREBASE_STORAGE_BUCKET, runtime?.firebase?.storageBucket),
  messagingSenderId: firstString(env.VITE_FIREBASE_MESSAGING_SENDER_ID, runtime?.firebase?.messagingSenderId),
  appId: firstString(env.VITE_FIREBASE_APP_ID, runtime?.firebase?.appId),
};

export const runtimeRecaptchaEnterpriseSiteKey = firstString(
  env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY,
  runtime?.recaptchaEnterpriseSiteKey,
);

export const runtimeGeminiModel = firstString(env.VITE_GEMINI_MODEL, runtime?.geminiModel) || 'gemini-3.8-flash';

export const runtimeAppCheckDebugEnabled = String(env.VITE_APP_CHECK_DEBUG ?? '').toLowerCase() === 'true';
export const runtimeAppCheckDebugToken = firstString(env.VITE_APP_CHECK_DEBUG_TOKEN);
