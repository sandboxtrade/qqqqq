import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "./app/store";
import {
  characterProfiles,
  getCharacterProfile,
} from "./character/character-registry";
import {
  isFirebaseConfigured,
  isLocalRepositoryAllowed,
  runtimeConfigurationError,
} from "./storage/firebase";
import { AuthGate, Icon } from "./ui/components";
import { ChatScreen } from "./ui/ChatScreen";
import { SettingsScreen } from "./ui/SettingsScreen";
import {
  CharacterProfileScreen,
  InboxScreen,
  PeopleScreen,
} from "./ui/SocialScreens";
import "./styles.css";

type SocialView = "inbox" | "people" | "chat" | "profile" | "settings";

// Legacy regression markers from the pre-social shell: settingsOpen = activeTab === "settings"; !settingsOpen && (; settings-content-area.

export default function App() {
  const {
    activeCharacterId,
    selectCharacter,
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
    clearConversationAndMemory,
    resettingData,
    setIntimacyAdultMode,
    updatingIntimacyMode,
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
    editablePersonality,
    editableMemory,
    editableContextUpdatedAt,
    editableContextBusy,
    exportBusy,
    loadEditableContext,
    saveEditablePersonality,
    saveEditableMemory,
    exportConversation,
  } = useAppStore();

  const [view, setView] = useState<SocialView>("inbox");
  const [profileCharacterId, setProfileCharacterId] = useState(activeCharacterId);
  const activeProfile = useMemo(
    () => getCharacterProfile(activeCharacterId),
    [activeCharacterId],
  );
  const profileCharacter = useMemo(
    () => getCharacterProfile(profileCharacterId),
    [profileCharacterId],
  );

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const onFocus = () => reconcileWorld(true);
    const onOnline = () => reconcileWorld(true);
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconcileWorld(true);
    };
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
    return <AuthGate busy={busy} error={error} onSignIn={() => void signIn()} />;
  }

  const transportKind = runtimeConfigurationError
    ? "config"
    : lastTrace?.cloudLanguage?.used
      ? "gpt"
      : lastTrace?.cloudLanguage?.attempted
        ? "local"
        : isLocalRepositoryAllowed
          ? "local"
          : "cloud";
  const transportLabel =
    transportKind === "config"
      ? "CONFIG"
      : transportKind === "gpt"
        ? "GPT"
        : transportKind === "local"
          ? "LOCAL"
          : "CLOUD";

  const openChat = async (characterId: string) => {
    if (characterId !== activeCharacterId) await selectCharacter(characterId);
    setView("chat");
  };

  const openProfile = (characterId: string) => {
    setProfileCharacterId(characterId);
    setView("profile");
  };

  const showBottomNav = view === "inbox" || view === "people";

  return (
    <main className="social-app-shell">
      {view === "chat" && (
        <header className="messenger-header">
          <button className="messenger-back" type="button" onClick={() => setView("inbox")}>‹</button>
          <button className="messenger-person" type="button" onClick={() => openProfile(activeCharacterId)}>
            <span className={`mini-social-avatar tone-${activeProfile.avatarTone}`}>
              {activeProfile.core.name.slice(0, 1)}
            </span>
            <span>
              <strong>{activeProfile.core.name}</strong>
              <small>{initializing ? "подключение…" : busy ? "печатает…" : "в сети"}</small>
            </span>
          </button>
          <div className={`top-status top-status-${transportKind}`} title="Состояние языкового слоя">
            <span className={ready ? "status-dot online" : "status-dot"} />
            <span>{transportLabel}</span>
          </div>
        </header>
      )}

      {error && (
        <div className="error-banner social-error-banner">
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

      <div className={`social-content ${view === "chat" ? "chat-content" : ""}`}>
        {view === "inbox" && (
          <InboxScreen
            characters={characterProfiles}
            activeCharacterId={activeCharacterId}
            onOpenChat={(id) => void openChat(id)}
            onOpenProfile={openProfile}
          />
        )}

        {view === "people" && (
          <PeopleScreen
            characters={characterProfiles}
            onOpenProfile={openProfile}
            onOpenChat={(id) => void openChat(id)}
          />
        )}

        {view === "profile" && (
          <CharacterProfileScreen
            profile={profileCharacter}
            onBack={() => setView("people")}
            onMessage={() => void openChat(profileCharacter.id)}
          />
        )}

        {view === "chat" && (
          <ChatScreen
            characterName={activeProfile.core.name}
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

        {view === "settings" && (
          <SettingsScreen
            characterName={activeProfile.core.name}
            firebaseEnabled={isFirebaseConfigured && !runtimeConfigurationError}
            onClose={() => setView("inbox")}
            appCheckState={appCheckState}
            user={user}
            trace={lastTrace}
            maintenanceError={maintenanceError}
            onSignOut={() => void signOut()}
            onClearConversationAndMemory={clearConversationAndMemory}
            clearingData={resettingData}
            resetDisabled={!ready || resettingData}
            intimacyEnabled={runtime?.intimacy?.adultModeEnabled === true}
            intimacyPhase={runtime?.intimacy?.phase ?? "normal"}
            intimacyUpdating={updatingIntimacyMode}
            onSetIntimacyEnabled={setIntimacyAdultMode}
            personality={editablePersonality}
            memory={editableMemory}
            contextUpdatedAt={editableContextUpdatedAt}
            contextBusy={editableContextBusy}
            onReloadContext={loadEditableContext}
            onSavePersonality={saveEditablePersonality}
            onSaveMemory={saveEditableMemory}
            exportBusy={exportBusy}
            onExportConversation={exportConversation}
          />
        )}
      </div>

      {showBottomNav && (
        <nav className="social-bottom-nav" aria-label="Навигация">
          <button className={view === "inbox" ? "active" : ""} type="button" onClick={() => setView("inbox")}>
            <Icon name="chat" size={20} />
            <span>Чаты</span>
          </button>
          <button className={view === "people" ? "active" : ""} type="button" onClick={() => setView("people")}>
            <Icon name="together" size={20} />
            <span>Люди</span>
          </button>
          <button type="button" onClick={() => setView("settings")}>
            <Icon name="settings" size={20} />
            <span>Настройки</span>
          </button>
        </nav>
      )}
    </main>
  );
}
