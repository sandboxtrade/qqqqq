import { useEffect, useState } from "react";
import { useAppStore } from "./app/store";
import { defaultCharacter } from "./character/character";
import {
  isFirebaseConfigured,
  isLocalRepositoryAllowed,
  runtimeConfigurationError,
} from "./storage/firebase";
import { AuthGate } from "./ui/components";
import { BottomNav, type AppTab } from "./ui/components";
import { CharacterStage } from "./ui/CharacterStage";
import { ChatScreen } from "./ui/ChatScreen";
import { CustomizeScreen } from "./ui/SecondaryScreens";
import { SettingsScreen } from "./ui/SettingsScreen";
import { TogetherScreen } from "./ui/SecondaryScreens";
import "./styles.css";

export default function App() {
  const {
    ready,
    initializing,
    busy,
    messages,
    runtime,
    lastTrace,
    authStatus,
    user,
    appCheckState,
    error,
    initialize,
    signIn,
    signOut,
    send,
    clearError,
    retry,
    dismissFailed,
    streamingText,
    chatDraft,
    setChatDraft,
    phase,
    maintenanceError,
    reconcileWorld,
    hasOlderMessages,
    loadingOlder,
    loadOlder,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<AppTab>("chat");
  const visualCueKey = lastTrace
    ? [...messages]
        .reverse()
        .find((message) => message.role === "character" && !message.proactive)?.id ?? null
    : null;

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const onFocus = () => reconcileWorld(true);
    const onOnline = () => reconcileWorld(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconcileWorld(true);
    };
    // Time-dependent world/romance state must continue to move while the app
    // stays open. Passive ticks are local-only; focus/online also retry cloud
    // maintenance immediately.
    const clockTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") reconcileWorld(false);
    }, 60_000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(clockTimer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reconcileWorld]);

  if (isFirebaseConfigured && authStatus === "signed_out") {
    return (
      <AuthGate busy={busy} error={error} onSignIn={() => void signIn()} />
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="mini-avatar">
            {defaultCharacter.name.slice(0, 1)}
          </span>
          <div>
            <strong>{defaultCharacter.name}</strong>
            <small>
              {initializing ? "просыпается…" : ready ? "рядом" : "подключение…"}
            </small>
          </div>
        </div>
        <div className="top-status">
          <span className={ready ? "status-dot online" : "status-dot"} />
          <span>
            {runtimeConfigurationError
              ? "config"
              : isLocalRepositoryAllowed
                ? "local"
                : "cloud"}
          </span>
        </div>
      </header>

      <CharacterStage
        runtime={runtime}
        busy={busy}
        visualCue={lastTrace?.responsePlan.visualCue ?? null}
        visualCueKey={visualCueKey}
        onNavigate={setActiveTab}
        onQuietAction={(text) => { setActiveTab("chat"); void send(text); }}
        quietActionDisabled={!ready || busy}
      />

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              clearError();
              if (!ready) void initialize();
            }}
          >
            {!ready ? "Повторить" : "×"}
          </button>
        </div>
      )}

      <div className="content-area">
        {activeTab === "chat" && (
          <ChatScreen
            messages={messages}
            ready={ready}
            busy={busy}
            onSend={send}
            draft={chatDraft}
            onDraftChange={setChatDraft}
            streamingText={streamingText}
            phase={phase}
            onRetry={retry}
            onDismissFailed={dismissFailed}
            hasOlderMessages={hasOlderMessages}
            loadingOlder={loadingOlder}
            onLoadOlder={loadOlder}
          />
        )}
        {activeTab === "together" && <TogetherScreen />}
        {activeTab === "look" && <CustomizeScreen mode="look" />}
        {activeTab === "room" && <CustomizeScreen mode="room" />}
        {activeTab === "settings" && (
          <SettingsScreen
            firebaseEnabled={isFirebaseConfigured && !runtimeConfigurationError}
            appCheckState={appCheckState}
            user={user}
            trace={lastTrace}
            maintenanceError={maintenanceError}
            onSignOut={() => void signOut()}
          />
        )}
      </div>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </main>
  );
}
