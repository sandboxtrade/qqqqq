import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirebaseApp, isFirebaseConfigured } from './firebase';

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

export function waitForInitialAuth(): Promise<AuthProfile | null> {
  if (!isFirebaseConfigured) return Promise.resolve(null);
  const app = getFirebaseApp();
  if (!app) return Promise.resolve(null);
  const auth = getAuth(app);
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user ? profile(user) : null);
    });
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
  if (!app) throw new Error('Firebase is not configured.');
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const result = await signInWithPopup(auth, provider);
    return profile(result.user);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      throw new Error('REDIRECT_STARTED');
    }
    throw error;
  }
}

export async function signOutFirebase() {
  const app = getFirebaseApp();
  if (!app) return;
  await signOut(getAuth(app));
}
