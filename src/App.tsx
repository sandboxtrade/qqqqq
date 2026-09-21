import { useEffect, useState } from 'react';
import { useAppStore } from './app/store';
import { defaultCharacter } from './character/default-character';
import { isFirebaseConfigured } from './storage/firebase';
import { AuthGate } from './ui/components/AuthGate';
import { BottomNav, type AppTab } from './ui/components/BottomNav';
import { CharacterStage } from './ui/components/CharacterStage';
import { ChatScreen } from './ui/screens/ChatScreen';
import { CustomizeScreen } from './ui/screens/CustomizeScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { TogetherScreen } from './ui/screens/TogetherScreen';
import './styles.css';

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
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<AppTab>('chat');

  useEffect(() => { void initialize(); }, [initialize]);

  if (isFirebaseConfigured && authStatus === 'signed_out') {
    return <AuthGate busy={busy} error={error} onSignIn={() => void signIn()} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="mini-avatar">{defaultCharacter.name.slice(0, 1)}</span>
          <div><strong>{defaultCharacter.name}</strong><small>{initializing ? 'просыпается…' : ready ? 'рядом' : 'подключение…'}</small></div>
        </div>
        <div className="top-status"><span className={ready ? 'status-dot online' : 'status-dot'} /><span>{isFirebaseConfigured ? 'cloud' : 'local'}</span></div>
      </header>

      <CharacterStage runtime={runtime} busy={busy} onNavigate={setActiveTab} />

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" onClick={clearError}>×</button>
        </div>
      )}

      <div className="content-area">
        {activeTab === 'chat' && <ChatScreen messages={messages} ready={ready} busy={busy} onSend={send} />}
        {activeTab === 'together' && <TogetherScreen />}
        {activeTab === 'look' && <CustomizeScreen mode="look" />}
        {activeTab === 'room' && <CustomizeScreen mode="room" />}
        {activeTab === 'settings' && (
          <SettingsScreen
            firebaseEnabled={isFirebaseConfigured}
            appCheckState={appCheckState}
            user={user}
            trace={lastTrace}
            onSignOut={() => void signOut()}
          />
        )}
      </div>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </main>
  );
}
