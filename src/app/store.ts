import { create } from 'zustand';
import type { RuntimeState, RuntimeTrace } from '../engine/runtime';
import { bootstrapRuntime, handleUserMessage } from '../engine/runtime';
import { getAppCheckState, initializeFirebaseAppCheck, isFirebaseConfigured, type AppCheckState } from '../storage/firebase';
import { signInWithGoogle, signOutFirebase, waitForInitialAuth, type AuthProfile } from '../storage/auth';

export interface ChatMessage {
  id: string;
  role: 'user' | 'character';
  text: string;
  timestamp: number;
  proactive?: boolean;
}

export type AuthStatus = 'local' | 'checking' | 'signed_out' | 'signed_in';

interface AppStore {
  ready: boolean;
  initializing: boolean;
  busy: boolean;
  authStatus: AuthStatus;
  user: AuthProfile | null;
  appCheckState: AppCheckState;
  error: string | null;
  messages: ChatMessage[];
  runtime: RuntimeState | null;
  lastTrace: RuntimeTrace | null;
  initialize: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  send: (text: string) => Promise<void>;
  clearError: () => void;
}

async function bootRuntime(set: (updater: (state: AppStore) => Partial<AppStore>) => void) {
  const bootstrap = await bootstrapRuntime();
  const history: ChatMessage[] = bootstrap.recentConversation.map((line) => ({
    id: line.id,
    role: line.role,
    text: line.text,
    timestamp: line.timestamp,
    proactive: line.proactive,
  }));

  const proactive: ChatMessage[] = bootstrap.proactiveMessage
    ? [{
        id: crypto.randomUUID(),
        role: 'character',
        text: bootstrap.proactiveMessage,
        timestamp: Date.now(),
        proactive: true,
      }]
    : [];

  set(() => ({
    runtime: bootstrap.state,
    ready: true,
    initializing: false,
    messages: [...history, ...proactive].slice(-50),
    error: null,
  }));
}

export const useAppStore = create<AppStore>((set, get) => ({
  ready: false,
  initializing: false,
  busy: false,
  authStatus: isFirebaseConfigured ? 'checking' : 'local',
  user: null,
  appCheckState: isFirebaseConfigured ? 'missing_site_key' : 'disabled',
  error: null,
  messages: [],
  runtime: null,
  lastTrace: null,

  initialize: async () => {
    // React StrictMode can invoke mount effects twice in development.
    if (get().initializing || get().ready) return;
    set(() => ({ initializing: true, error: null }));

    try {
      const appCheckState = initializeFirebaseAppCheck();
      set(() => ({ appCheckState }));

      if (isFirebaseConfigured) {
        const user = await waitForInitialAuth();
        if (!user) {
          set(() => ({ authStatus: 'signed_out', user: null, ready: false, initializing: false }));
          return;
        }
        set(() => ({ authStatus: 'signed_in', user }));
      }

      await bootRuntime(set);
    } catch (error) {
      set(() => ({
        initializing: false,
        ready: false,
        error: error instanceof Error ? error.message : 'Не удалось запустить приложение.',
      }));
    }
  },

  signIn: async () => {
    if (!isFirebaseConfigured || get().busy) return;
    set(() => ({ busy: true, error: null }));
    try {
      const user = await signInWithGoogle();
      set(() => ({ user, authStatus: 'signed_in', busy: false }));
      await bootRuntime(set);
    } catch (error) {
      if (error instanceof Error && error.message === 'REDIRECT_STARTED') return;
      set(() => ({
        busy: false,
        error: error instanceof Error ? error.message : 'Не удалось войти через Google.',
      }));
    }
  },

  signOut: async () => {
    set(() => ({ busy: true, error: null }));
    try {
      await signOutFirebase();
      set(() => ({
        busy: false,
        ready: false,
        authStatus: isFirebaseConfigured ? 'signed_out' : 'local',
        user: null,
        runtime: null,
        messages: [],
        lastTrace: null,
      }));
    } catch (error) {
      set(() => ({
        busy: false,
        error: error instanceof Error ? error.message : 'Не удалось выйти.',
      }));
    }
  },

  send: async (text) => {
    const value = text.trim();
    const runtime = get().runtime;
    if (!value || !runtime || get().busy) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: value,
      timestamp: Date.now(),
    };
    set((state) => ({ busy: true, error: null, messages: [...state.messages, userMessage].slice(-50) }));

    try {
      const result = await handleUserMessage(value, runtime);
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'character',
        text: result.reply,
        timestamp: Date.now(),
      };
      set((state) => ({
        busy: false,
        messages: [...state.messages, reply].slice(-50),
        runtime: result.state,
        lastTrace: result.trace,
      }));
    } catch (error) {
      set(() => ({
        busy: false,
        error: error instanceof Error ? error.message : 'Ошибка движка.',
      }));
    }
  },

  clearError: () => set(() => ({ error: null, appCheckState: getAppCheckState() })),
}));
