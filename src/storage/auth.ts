import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase";

export interface AuthProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

function profile(user: User): AuthProfile {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
}

export function waitForInitialAuth(
  timeoutMs = 6000,
): Promise<AuthProfile | null> {
  if (!isFirebaseConfigured) return Promise.resolve(null);
  const app = getFirebaseApp();
  if (!app) return Promise.resolve(null);
  const auth = getAuth(app);

  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;

    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      unsubscribe?.();
      resolve(user ? profile(user) : null);
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      reject(
        new Error(
          "Google Auth не завершил проверку входа. Повтори подключение.",
        ),
      );
    }, timeoutMs);

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => finish(user),
      (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          unsubscribe?.();
          reject(error);
        }
      },
    );
  });
}

export function getAuthenticatedUid(): string | null {
  if (!isFirebaseConfigured) return null;
  const app = getFirebaseApp();
  if (!app) return null;
  return getAuth(app).currentUser?.uid ?? null;
}

export async function signInWithGoogle(): Promise<AuthProfile> {
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase is not configured.");
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const result = await signInWithPopup(auth, provider);
    return profile(result.user);
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    if (
      code === "auth/popup-blocked" ||
      code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(auth, provider);
      throw new Error("REDIRECT_STARTED");
    }
    throw error;
  }
}

export async function signOutFirebase() {
  const app = getFirebaseApp();
  if (!app) return;
  await signOut(getAuth(app));
}

export function observeAuth(listener: (user: AuthProfile | null) => void) {
  const app = getFirebaseApp();
  return app
    ? onAuthStateChanged(getAuth(app), (user) =>
        listener(user ? profile(user) : null),
      )
    : () => {};
}
export async function finishRedirect() {
  const app = getFirebaseApp();
  if (app) await getRedirectResult(getAuth(app));
}
