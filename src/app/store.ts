import { create } from "zustand";
import {
  bootstrapRuntime,
  clearConversationAndMemory as resetConversationMemoryRuntime,
  dismissPendingTurn,
  handleUserMessage,
  maintainRuntime,
  reconcileRuntimeState,
  refreshRuntimeFromPersistence,
  loadOlderConversation,
  conversationFrom,
  runtimeNow,
  setIntimacyAdultMode as updateIntimacyAdultModeRuntime,
  type RuntimeState,
  type RuntimeTrace,
  type ConversationLine,
} from "../engine/runtime";
import {
  getAppCheckState,
  initializeFirebaseAppCheck,
  verifyAppCheck,
  isFirebaseConfigured,
  isLocalRepositoryAllowed,
  type AppCheckState,
} from "../storage/firebase";
import { assertRuntimeConfiguration } from "../config/runtime-config";
import {
  signInWithGoogle,
  signOutFirebase,
  waitForInitialAuth,
  observeAuth,
  finishRedirect,
  type AuthProfile,
} from "../storage/auth";
import { bounded, errorText } from "../core/async";
import { resetWorldClock } from "../world/world";
import type { CharacterInitiative } from "../initiative/initiative";
import { maintenanceRetryDelay, nextInitiativeCheckAt } from "./app-utils";
import type { ConversationCursor } from "../storage/repositories/interfaces";
import { subscribeCharacterLiveSync } from "../storage/live-sync";
import { defaultCharacter } from "../character/character";
import { mergeChatMessages, replyForFailedMessage, replyTargets } from "./app-utils";
export interface ChatMessage extends ConversationLine {
  delivery?: "pending" | "failed" | "skipped" | "saved";
}
export type AuthStatus = "local" | "checking" | "signed_out" | "signed_in";
interface AppStore {
  ready: boolean;
  initializing: boolean;
  busy: boolean;
  authStatus: AuthStatus;
  user: AuthProfile | null;
  appCheckState: AppCheckState;
  error: string | null;
  maintenanceError: string | null;
  messages: ChatMessage[];
  runtime: RuntimeState | null;
  lastTrace: RuntimeTrace | null;
  streamingText: string;
  chatDraft: string;
  phase: string;
  failedMessageIds: string[];
  historyCursor: ConversationCursor | null;
  hasOlderMessages: boolean;
  loadingOlder: boolean;
  resettingData: boolean;
  updatingIntimacyMode: boolean;
  initialize: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearConversationAndMemory: () => Promise<void>;
  setIntimacyAdultMode: (enabled: boolean) => Promise<void>;
  send: (text: string) => Promise<void>;
  retry: (messageId: string) => Promise<void>;
  dismissFailed: (messageId: string) => Promise<void>;
  setChatDraft: (text: string) => void;
  loadOlder: () => Promise<void>;
  reconcileWorld: (runMaintenance?: boolean) => void;
  clearError: () => void;
}
let epoch = 0;
let active: AbortController | null = null;
let maintenance: AbortController | null = null;
let maintenanceTimer: ReturnType<typeof setTimeout> | null = null;
let maintenanceTimerDue = 0;
let maintenanceQueued = false;
let maintenanceRetryAttempt = 0;
let initiativeTimer: ReturnType<typeof setTimeout> | null = null;
let initiativeTimerDue = 0;
let initiativeGeneration: AbortController | null = null;
let initiativeQueued = false;
let watching = false;
let authAction = false;
let liveUnsubscribe: (() => void) | null = null;
let liveRefresh: AbortController | null = null;
let pendingLiveRevision = 0;
let flushLiveRevision: (() => void) | null = null;
let activeTurnId: string | null = null;
let activeTurnConfirmed = false;
function warmAppCheck() {
  if (isFirebaseConfigured) void verifyAppCheck().catch(() => {});
}
function stopLiveSync() {
  pendingLiveRevision = 0;
  flushLiveRevision = null;
  liveUnsubscribe?.();
  liveUnsubscribe = null;
  liveRefresh?.abort();
  liveRefresh = null;
}

function clearMaintenanceTimer() {
  if (maintenanceTimer) clearTimeout(maintenanceTimer);
  maintenanceTimer = null;
  maintenanceTimerDue = 0;
}
function clearInitiativeTimer() {
  if (initiativeTimer) clearTimeout(initiativeTimer);
  initiativeTimer = null;
  initiativeTimerDue = 0;
}
function cancelInitiativeForUserTurn() {
  clearInitiativeTimer();
  initiativeQueued = false;
  initiativeGeneration?.abort(new Error("initiative-superseded-by-user"));
  initiativeGeneration = null;
}
function stopMaintenance() {
  clearMaintenanceTimer();
  clearInitiativeTimer();
  maintenanceQueued = false;
  initiativeQueued = false;
  maintenanceRetryAttempt = 0;
  initiativeGeneration?.abort();
  initiativeGeneration = null;
  maintenance?.abort();
  maintenance = null;
}
function invalidate() {
  epoch++;
  resetWorldClock();
  active?.abort();
  active = null;
  stopMaintenance();
  stopLiveSync();
  return epoch;
}
function startLiveSync(version: number, user: AuthProfile | null) {
  stopLiveSync();
  if (!isFirebaseConfigured || !user) return;

  const refreshRuntime = (revision: number) => {
    if (version !== epoch) return;
    pendingLiveRevision = Math.max(pendingLiveRevision, revision);
    const state = useAppStore.getState();
    if (
      version !== epoch ||
      state.busy ||
      !state.runtime ||
      pendingLiveRevision <= state.runtime.revision
    )
      return;
    liveRefresh?.abort();
    const controller = new AbortController();
    liveRefresh = controller;
    void bounded(
      refreshRuntimeFromPersistence(user.uid, controller.signal, state.runtime),
      9000,
      "Синхронизация состояния",
      controller.signal,
    )
      .then((runtime) => {
        if (
          version === epoch &&
          !controller.signal.aborted &&
          !useAppStore.getState().busy &&
          runtime.revision >= (useAppStore.getState().runtime?.revision ?? 0)
        )
          useAppStore.setState({ runtime });
      })
      .catch((error) => {
        if (version === epoch && !controller.signal.aborted)
          useAppStore.setState({ maintenanceError: errorText(error) });
      })
      .finally(() => {
        controller.abort();
        if (liveRefresh === controller) liveRefresh = null;
      });
  };

  flushLiveRevision = () => refreshRuntime(pendingLiveRevision);
  const newestConversation = [...useAppStore.getState().messages]
    .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))[0];
  liveUnsubscribe = subscribeCharacterLiveSync(defaultCharacter.id, user.uid, {
    onEvents: (events) => {
      if (version !== epoch) return;
      const incoming = conversationFrom(events)
        .filter((message) => !message.silent)
        .map((message) => ({ ...message, delivery: "saved" as const }));
      useAppStore.setState((state) => {
        const resolvedIds = replyTargets(events);
        const activeResolved = replyForFailedMessage(events, activeTurnId);
        if (activeResolved) activeTurnConfirmed = true;
        const merged = mergeChatMessages(state.messages, incoming).map((message) =>
          resolvedIds.has(message.id)
            ? { ...message, delivery: "saved" as const }
            : message,
        );
        const failedMessageIds = state.failedMessageIds.filter(
          (id) => !resolvedIds.has(id),
        );
        return {
          messages: merged,
          failedMessageIds,
          streamingText: activeResolved ? "" : state.streamingText,
          error:
            failedMessageIds.length < state.failedMessageIds.length
              ? null
              : state.error,
        };
      });
    },
    onRevision: refreshRuntime,
    onError: (error) => {
      if (version === epoch)
        useAppStore.setState({ maintenanceError: errorText(error) });
    },
  }, {
    after: newestConversation
      ? { timestamp: newestConversation.timestamp, id: newestConversation.id }
      : null,
  });
}

function canSurfaceInitiative(version: number) {
  const state = useAppStore.getState();
  if (version !== epoch || !state.ready || state.busy || !state.runtime) return false;
  const now = runtimeNow(state.runtime);
  return (
    state.runtime.world.isAwake &&
    state.runtime.world.availability !== "sleeping" &&
    now - state.runtime.world.lastUserInteractionAt > 10 * 60_000
  );
}

function scheduleInitiativeAttempt(delayMs: number) {
  const version = epoch;
  const due = Date.now() + Math.max(0, delayMs);
  if (initiativeTimer && initiativeTimerDue <= due) return;
  clearInitiativeTimer();
  initiativeTimerDue = due;
  initiativeTimer = setTimeout(() => {
    initiativeTimer = null;
    initiativeTimerDue = 0;
    if (version !== epoch) return;
    void runMaintenance(true, version);
  }, Math.max(0, delayMs));
}

function scheduleNextInitiative(initiatives: CharacterInitiative[]) {
  const state = useAppStore.getState();
  if (!state.ready || !state.runtime || state.busy) return;
  const now = runtimeNow(state.runtime);
  const nextAt = nextInitiativeCheckAt(initiatives, state.runtime.world, now);
  // setTimeout is a signed 32-bit delay in browsers.
  const delay = Math.max(250, Math.min(2_147_000_000, nextAt - now));
  scheduleInitiativeAttempt(delay);
}

function scheduleMaintenance(delayMs = 2000) {
  const version = epoch;
  if (maintenance) {
    maintenanceQueued = true;
    return;
  }
  const due = Date.now() + Math.max(0, delayMs);
  if (maintenanceTimer && maintenanceTimerDue <= due) return;
  clearMaintenanceTimer();
  maintenanceTimerDue = due;
  maintenanceTimer = setTimeout(() => {
    maintenanceTimer = null;
    maintenanceTimerDue = 0;
    if (version !== epoch) return;
    void runMaintenance(false, version);
  }, Math.max(0, delayMs));
}

async function runMaintenance(allowInitiative: boolean, version = epoch) {
  if (version !== epoch) return;
  const store = useAppStore.getState();
  if (!store.ready || !store.runtime) return;
  if (store.busy) {
    if (allowInitiative) scheduleInitiativeAttempt(1500);
    else scheduleMaintenance(1500);
    return;
  }
  if (maintenance) {
    if (allowInitiative) initiativeQueued = true;
    else maintenanceQueued = true;
    return;
  }

  const controller = new AbortController();
  const initiativeController = allowInitiative ? new AbortController() : null;
  maintenance = controller;
  if (initiativeController) initiativeGeneration = initiativeController;

  try {
    const result = await bounded(
      maintainRuntime(store.user?.uid ?? null, controller.signal, store.runtime, {
        allowInitiative,
        initiativeSignal: initiativeController?.signal,
        canSurfaceInitiative: () => canSurfaceInitiative(version),
      }),
      30000,
      "Обработка памяти",
      controller.signal,
    );
    if (version !== epoch || controller.signal.aborted) return;
    maintenanceRetryAttempt = 0;
    useAppStore.setState((state) => ({
      maintenanceError: null,
      appCheckState: getAppCheckState(),
      lastTrace: state.lastTrace
        ? { ...state.lastTrace, maintenance: result }
        : null,
      messages: result.message
        ? mergeChatMessages(state.messages, [
            { ...result.message, delivery: "saved" as const },
          ])
        : state.messages,
    }));
    scheduleNextInitiative(result.initiatives);
    if (result.memoryBacklog) maintenanceQueued = true;
  } catch (error) {
    if (version === epoch && !controller.signal.aborted) {
      maintenanceRetryAttempt += 1;
      useAppStore.setState({ maintenanceError: errorText(error) });
      const retryIn = maintenanceRetryDelay(maintenanceRetryAttempt);
      clearMaintenanceTimer();
      maintenanceTimerDue = Date.now() + retryIn;
      maintenanceTimer = setTimeout(() => {
        maintenanceTimer = null;
        maintenanceTimerDue = 0;
        if (version === epoch) void runMaintenance(false, version);
      }, retryIn);
    }
  } finally {
    controller.abort();
    if (maintenance === controller) maintenance = null;
    if (initiativeGeneration === initiativeController) initiativeGeneration = null;
    initiativeController?.abort();

    if (version === epoch) {
      if (maintenanceQueued) {
        maintenanceQueued = false;
        scheduleMaintenance(5000);
      }
      if (initiativeQueued) {
        initiativeQueued = false;
        scheduleInitiativeAttempt(250);
      }
    }
  }
}
async function boot(version: number, user: AuthProfile | null) {
  const controller = new AbortController();
  active = controller;
  try {
    const result = await bounded(
      bootstrapRuntime(user?.uid ?? null, controller.signal),
      12000,
      "Запуск",
      controller.signal,
    );
    if (version !== epoch) return;
    const failedMessageIds = [...new Set(result.pendingTurnIds)];
    const failedSet = new Set(failedMessageIds);
    useAppStore.setState({
      runtime: result.state,
      ready: true,
      initializing: false,
      busy: false,
      user,
      authStatus: isFirebaseConfigured ? "signed_in" : "local",
      messages: result.recentConversation
        .filter((m) => !m.silent)
        .map((m) => ({
          ...m,
          delivery: failedSet.has(m.id) ? "failed" : "saved",
        })),
      failedMessageIds,
      historyCursor: result.historyCursor,
      hasOlderMessages: result.hasOlderConversation,
      loadingOlder: false,
      error: failedMessageIds.length
        ? `Есть ${failedMessageIds.length} ${failedMessageIds.length === 1 ? "сообщение" : "сообщения"} без ответа. Их можно повторить, изменить или пропустить.`
        : null,
      streamingText: "",
      phase: "",
      appCheckState: getAppCheckState(),
    });
    startLiveSync(version, user);
    scheduleMaintenance();
  } finally {
    controller.abort();
    if (active === controller) active = null;
  }
}
function watchAuth() {
  if (watching || !isFirebaseConfigured) return;
  watching = true;
  observeAuth((user) => {
    const state = useAppStore.getState();
    if (
      authAction ||
      state.initializing ||
      state.authStatus === "checking" ||
      state.user?.uid === user?.uid
    )
      return;
    invalidate();
    useAppStore.setState({
      ready: false,
      busy: false,
      initializing: false,
      user: null,
      runtime: null,
      messages: [],
      lastTrace: null,
      streamingText: "",
      chatDraft: "",
      failedMessageIds: [],
      historyCursor: null,
      hasOlderMessages: false,
      loadingOlder: false,
      resettingData: false,
      updatingIntimacyMode: false,
      phase: "",
      error: null,
      authStatus: user ? "checking" : "signed_out",
    });
    if (user) void useAppStore.getState().initialize();
  });
}
function isRecoverableTurnSyncError(error: unknown) {
  const message = errorText(error);
  return /\[(?:state-conflict|state-world-conflict)\]/iu.test(message);
}

async function sendTurn(message: ChatMessage) {
  const store = useAppStore.getState();
  if (!store.ready || !store.runtime || store.busy) return;
  cancelInitiativeForUserTurn();
  liveRefresh?.abort();
  liveRefresh = null;
  activeTurnId = message.id;
  activeTurnConfirmed = false;
  warmAppCheck();
  const version = epoch;
  const controller = new AbortController();
  active = controller;
  const timer = setTimeout(
    () =>
      controller.abort(
        new Error(
          "Отправка заняла больше 40 секунд. Проверь соединение и повтори.",
        ),
      ),
    40000,
  );
  useAppStore.setState((state) => ({
    busy: true,
    error: null,
    streamingText: "",
    phase: "Отправляем…",
    failedMessageIds: state.failedMessageIds.filter((id) => id !== message.id),
    messages: state.messages.some((m) => m.id === message.id)
      ? state.messages.map((m) =>
          m.id === message.id ? { ...m, delivery: "pending" as const } : m,
        )
      : mergeChatMessages(state.messages, [
          { ...message, delivery: "pending" as const },
        ]),
  }));
  try {
    const baseHistory = store.messages.filter(
      (m) =>
        !/(естественный языковой слой|состояние, память и решение уже)/iu.test(
          m.text,
        ),
    );
    const turnOptions = (history: ChatMessage[]) => ({
      uid: store.user?.uid ?? null,
      signal: controller.signal,
      history,
      onChunk: (text: string) => {
        if (version === epoch && !controller.signal.aborted)
          useAppStore.setState({ streamingText: text });
      },
      onPhase: (phase: string) => {
        if (version === epoch && !controller.signal.aborted)
          useAppStore.setState({ phase });
      },
    });
    let result: Awaited<ReturnType<typeof handleUserMessage>>;
    try {
      result = await handleUserMessage(
        message,
        store.runtime,
        turnOptions(baseHistory),
      );
    } catch (error) {
      if (controller.signal.aborted || !isRecoverableTurnSyncError(error)) throw error;
      useAppStore.setState({
        streamingText: "",
        phase: "Восстанавливаем синхронизацию…",
      });
      // Same immutable message id is intentionally reused. appendEvent and
      // handleUserMessage are idempotent, so this recovers state conflicts
      // without duplicating the user's message or relationship effects.
      const recovered = await bootstrapRuntime(store.user?.uid ?? null, controller.signal);
      if (version !== epoch || controller.signal.aborted) return;
      useAppStore.setState({ runtime: recovered.state, maintenanceError: null });
      result = await handleUserMessage(
        message,
        recovered.state,
        turnOptions(recovered.recentConversation as ChatMessage[]),
      );
    }
    if (version !== epoch || controller.signal.aborted) return;
    useAppStore.setState((state) => {
      const savedMessages = state.messages
        .filter((m) => m.id !== result.replyId)
        .map((m) =>
          m.id === message.id ? { ...m, delivery: "saved" as const } : m,
        );
      return {
        busy: false,
        streamingText: "",
        phase: "",
        runtime: result.state,
        lastTrace: result.trace,
        appCheckState: getAppCheckState(),
        failedMessageIds: state.failedMessageIds.filter((id) => id !== message.id),
        messages: result.silent
          ? savedMessages
          : mergeChatMessages(savedMessages, [
              {
                id: result.replyId,
                role: "character" as const,
                text: result.reply,
                timestamp: result.replyTimestamp,
                templateId: result.renderMeta?.templateId,
                dialogueActs: result.renderMeta?.dialogueActs,
                appearanceAssetId: result.appearanceAssetId,
                delivery: "saved" as const,
              },
            ]),
      };
    });
  } catch (error) {
    if (version !== epoch) return;
    useAppStore.setState((state) => {
      const confirmed = (activeTurnId === message.id && activeTurnConfirmed) || state.messages.some(m => m.id === `reply_${message.id}` && m.delivery === "saved");
      return {
        busy: false, streamingText: "", phase: "",
        error: confirmed ? null : errorText(error),
        failedMessageIds: confirmed
          ? state.failedMessageIds.filter((id) => id !== message.id)
          : [...new Set([...state.failedMessageIds, message.id])],
        appCheckState: getAppCheckState(),
        messages: state.messages.map(m => m.id === message.id
          ? { ...m, delivery: confirmed ? "saved" as const : "failed" as const } : m),
      };
    });
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (active === controller) active = null;
    if (activeTurnId === message.id) activeTurnId = null;
    if (version === epoch) {
      // The user event may already be persisted even when a later storage step fails,
      // so memory work must be scheduled after every attempted turn.
      scheduleMaintenance();
      flushLiveRevision?.();
    }
  }
}
export const useAppStore = create<AppStore>((set, get) => ({
  ready: false,
  initializing: false,
  busy: false,
  authStatus: isLocalRepositoryAllowed ? "local" : "checking",
  user: null,
  appCheckState: isFirebaseConfigured ? "checking" : "disabled",
  error: null,
  maintenanceError: null,
  messages: [],
  runtime: null,
  lastTrace: null,
  streamingText: "",
  chatDraft: "",
  phase: "",
  failedMessageIds: [],
  historyCursor: null,
  hasOlderMessages: false,
  loadingOlder: false,
  resettingData: false,
  updatingIntimacyMode: false,
  initialize: async () => {
    if (get().initializing || get().ready) return;
    const version = invalidate();
    set({ initializing: true, error: null });
    try {
      assertRuntimeConfiguration();
      watchAuth();
      set({ appCheckState: initializeFirebaseAppCheck() });
      warmAppCheck();
      const user = isFirebaseConfigured
        ? await bounded(
            (async () => {
              await finishRedirect();
              return waitForInitialAuth(10000);
            })(),
            12000,
            "Google Auth",
          )
        : null;
      if (version !== epoch) return;
      if (isFirebaseConfigured && !user) {
        set({ initializing: false, authStatus: "signed_out", user: null });
        return;
      }
      set({ user, authStatus: isFirebaseConfigured ? "signed_in" : "local" });
      await boot(version, user);
    } catch (error) {
      if (version === epoch)
        set({
          initializing: false,
          busy: false,
          ready: false,
          error: errorText(error),
        });
    }
  },
  signIn: async () => {
    if (get().busy || get().initializing) return;
    const version = invalidate();
    authAction = true;
    set({ busy: true, error: null });
    try {
      assertRuntimeConfiguration();
      initializeFirebaseAppCheck();
      warmAppCheck();
      const user = await bounded(
        signInWithGoogle(),
        60000,
        "Вход через Google",
      );
      if (version !== epoch) return;
      set({ user, authStatus: "signed_in", initializing: true });
      await boot(version, user);
    } catch (error) {
      if (version === epoch)
        set({ busy: false, initializing: false, error: errorText(error) });
    } finally {
      authAction = false;
    }
  },
  signOut: async () => {
    invalidate();
    authAction = true;
    set({
      ready: false,
      busy: true,
      initializing: false,
      runtime: null,
      messages: [],
      lastTrace: null,
      streamingText: "",
      chatDraft: "",
      failedMessageIds: [],
      historyCursor: null,
      hasOlderMessages: false,
      loadingOlder: false,
      resettingData: false,
      updatingIntimacyMode: false,
      error: null,
      maintenanceError: null,
    });
    try {
      await bounded(signOutFirebase(), 10000, "Выход из Google");
      set({
        busy: false,
        user: null,
        authStatus: isLocalRepositoryAllowed ? "local" : "signed_out",
      });
    } catch (error) {
      set({ busy: false, error: errorText(error) });
    } finally {
      authAction = false;
    }
  },
  clearConversationAndMemory: async () => {
    const state = get();
    if (!state.ready || !state.runtime || state.resettingData) return;
    const user = state.user;
    const current = state.runtime;
    // Reset is also the escape hatch for a stuck send/Firebase operation.
    // invalidate() aborts the active turn, maintenance and live refresh first.
    const version = invalidate();
    const controller = new AbortController();
    active = controller;
    set({
      busy: true,
      resettingData: true,
      error: null,
      maintenanceError: null,
      streamingText: "",
      phase: "Очищаем диалог и память…",
    });
    try {
      await bounded(
        resetConversationMemoryRuntime(user?.uid ?? null, controller.signal, current),
        50000,
        "Очистка диалога и памяти",
        controller.signal,
      );
      if (version !== epoch || controller.signal.aborted) return;
      set({
        messages: [],
        lastTrace: null,
        chatDraft: "",
        failedMessageIds: [],
        historyCursor: null,
        hasOlderMessages: false,
        loadingOlder: false,
      });
      await boot(version, user);
      if (version === epoch)
        set({ resettingData: false, lastTrace: null, chatDraft: "", error: null });
    } catch (error) {
      if (version !== epoch) return;
      const message = errorText(error);
      try {
        await boot(version, user);
      } catch {
        // Keep the original destructive-operation error; normal initialize can retry boot.
      }
      if (version === epoch)
        set({ busy: false, resettingData: false, phase: "", error: message });
    } finally {
      controller.abort();
      if (active === controller) active = null;
    }
  },
  setIntimacyAdultMode: async (enabled) => {
    const state = get();
    if (!state.ready || !state.runtime || state.busy || state.updatingIntimacyMode) return;
    const version = epoch;
    const controller = new AbortController();
    active = controller;
    set({ busy: true, updatingIntimacyMode: true, error: null, phase: enabled ? "Включаем интимный режим…" : "Выключаем интимный режим…" });
    try {
      const runtime = await bounded(
        updateIntimacyAdultModeRuntime(state.user?.uid ?? null, controller.signal, state.runtime, enabled),
        12000,
        "Настройка интимного режима",
        controller.signal,
      );
      if (version !== epoch || controller.signal.aborted) return;
      set({ runtime, busy: false, updatingIntimacyMode: false, phase: "", error: null });
    } catch (error) {
      if (version === epoch && !controller.signal.aborted)
        set({ busy: false, updatingIntimacyMode: false, phase: "", error: errorText(error) });
    } finally {
      controller.abort();
      if (active === controller) active = null;
    }
  },
  send: async (text) => {
    const value = text.trim();
    if (!value || get().busy) return;
    if (value.length > 12000) {
      set({ error: "Максимальная длина сообщения — 12 000 символов." });
      return;
    }
    await sendTurn({
      id: crypto.randomUUID(),
      role: "user",
      text: value,
      timestamp: runtimeNow(get().runtime ?? undefined),
    });
  },
  retry: async (messageId) => {
    if (get().busy || !get().failedMessageIds.includes(messageId)) return;
    const message = get().messages.find((m) => m.id === messageId);
    if (message) await sendTurn(message);
  },
  dismissFailed: async (messageId) => {
    if (!get().failedMessageIds.includes(messageId)) return;
    const version = epoch;
    const controller = new AbortController();
    try {
      await bounded(
        dismissPendingTurn(get().user?.uid ?? null, controller.signal, messageId),
        8000,
        "Пропуск сообщения",
        controller.signal,
      );
      if (version !== epoch) return;
      set((state) => ({
        failedMessageIds: state.failedMessageIds.filter((id) => id !== messageId),
        messages: state.messages.map((message) =>
          message.id === messageId && message.delivery === "failed"
            ? { ...message, delivery: "skipped" as const }
            : message,
        ),
        error: null,
      }));
    } catch (error) {
      if (version === epoch) set({ error: errorText(error) });
    } finally {
      controller.abort();
    }
  },
  setChatDraft: (text) => set({ chatDraft: text.slice(0, 12000) }),
  loadOlder: async () => {
    const state = get();
    if (
      !state.ready ||
      state.loadingOlder ||
      !state.hasOlderMessages ||
      !state.historyCursor
    )
      return;
    const version = epoch;
    const controller = new AbortController();
    set({ loadingOlder: true });
    try {
      const result = await bounded(
        loadOlderConversation(
          state.user?.uid ?? null,
          controller.signal,
          state.historyCursor,
          60,
        ),
        10000,
        "Загрузка истории",
        controller.signal,
      );
      if (version !== epoch) return;
      set((current) => ({
        messages: mergeChatMessages(
          current.messages,
          result.messages
            .filter((message) => !message.silent)
            .map((message) => ({ ...message, delivery: "saved" as const })),
        ),
        historyCursor: result.historyCursor,
        hasOlderMessages: result.hasOlderConversation,
        loadingOlder: false,
      }));
    } catch (error) {
      if (version === epoch)
        set({ loadingOlder: false, error: errorText(error) });
    } finally {
      controller.abort();
    }
  },
  reconcileWorld: (runMaintenance = true) => {
    flushLiveRevision?.();
    const state = get();
    if (!state.ready || !state.runtime || state.busy) return;
    const previous = state.runtime;
    const next = reconcileRuntimeState(previous);
    if (next.world.lastSimulatedAt > previous.world.lastSimulatedAt)
      set({ runtime: next });
    if (runMaintenance) {
      // Focus/online recovery should retry immediately; a passive one-minute
      // clock tick only updates local time-dependent state.
      maintenanceRetryAttempt = 0;
      scheduleMaintenance(0);
      scheduleInitiativeAttempt(250);
    }
  },
  clearError: () => set({ error: null, appCheckState: getAppCheckState() }),
}));
