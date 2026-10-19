import { lazy, Suspense, useEffect, useState } from "react";
import { useAppStore } from "./app/store";
import { useShallow } from "zustand/react/shallow";
import { getCharacterProfile, isKnownCharacterId } from "./character/character-registry";
import { isFirebaseConfigured, runtimeConfigurationError } from "./storage/firebase";
import { AuthGate, Icon } from "./ui/components";
import { ChatScreen } from "./ui/ChatScreen";
import { PeopleScreen } from "./ui/PeopleScreen";
import { AlexandraSocial } from "./ui/AlexandraSocial";
import { MyProfile } from "./ui/MyProfile";
import { GIFT_CATALOG, TRANSFER_AMOUNTS, loadPlayerProfile, loadVirtualWallet, savePlayerProfile, spendVirtualCurrency,
  type PlayerProfile, type VirtualWallet, type VirtualTransactionKind } from "./storage/player-data";
import "./styles.css";
import "./social-v2.css";
import "./alexandra.css";

const SettingsScreen = lazy(() => import("./ui/SettingsScreen").then(m => ({ default: m.SettingsScreen })));
type Page = "chat" | "people" | "social" | "profile" | "settings";
type Spend = { characterId: string; kind: VirtualTransactionKind; label: string; amount: number };

export default function App() {
  const {
    ready, initializing, busy, runtime, messages, lastTrace, authStatus, user, appCheckState, error,
    activeCharacterId, selectCharacter,
    initialize, signIn, signOut, clearConversationAndMemory, resettingData,
    send, clearError, retry, retryPhoto, dismissFailed, chatDraft, setChatDraft,
    maintenanceError, reconcileWorld, hasOlderMessages, loadingOlder, loadOlder,
    editablePersonality, editableMemory, photoNoRefusalMode, editableContextUpdatedAt,
    editableContextBusy, exportBusy, loadEditableContext, saveEditablePersonality,
    saveEditableMemory, setPhotoNoRefusalMode, exportConversation,
  } = useAppStore(useShallow(s => ({
    ready: s.ready, initializing: s.initializing, busy: s.busy, runtime: s.runtime,
    messages: s.messages, lastTrace: s.lastTrace, authStatus: s.authStatus, user: s.user,
    activeCharacterId: s.activeCharacterId, selectCharacter: s.selectCharacter,
    appCheckState: s.appCheckState, error: s.error, initialize: s.initialize,
    signIn: s.signIn, signOut: s.signOut,
    clearConversationAndMemory: s.clearConversationAndMemory, resettingData: s.resettingData,
    send: s.send, clearError: s.clearError, retry: s.retry, retryPhoto: s.retryPhoto,
    dismissFailed: s.dismissFailed, chatDraft: s.chatDraft, setChatDraft: s.setChatDraft,
    maintenanceError: s.maintenanceError, reconcileWorld: s.reconcileWorld,
    hasOlderMessages: s.hasOlderMessages, loadingOlder: s.loadingOlder, loadOlder: s.loadOlder,
    editablePersonality: s.editablePersonality, editableMemory: s.editableMemory,
    photoNoRefusalMode: s.photoNoRefusalMode,
    editableContextUpdatedAt: s.editableContextUpdatedAt,
    editableContextBusy: s.editableContextBusy, exportBusy: s.exportBusy,
    loadEditableContext: s.loadEditableContext, saveEditablePersonality: s.saveEditablePersonality,
    saveEditableMemory: s.saveEditableMemory, setPhotoNoRefusalMode: s.setPhotoNoRefusalMode,
    exportConversation: s.exportConversation,
  })));
  const [page, setPage] = useState<Page>("chat");
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [wallet, setWallet] = useState<VirtualWallet | null>(null);
  const [playerLoading, setPlayerLoading] = useState(true);
  const [playerBusy, setPlayerBusy] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const uid = user?.uid ?? null;
  const character = getCharacterProfile(activeCharacterId);

  useEffect(() => { void initialize(); }, [initialize]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
      if (viewport.scale === 1) document.documentElement.style.setProperty("--app-height", `${viewport.height}px`);
    }); };
    viewport.addEventListener("resize", update);
    update();
    return () => { cancelAnimationFrame(frame); viewport.removeEventListener("resize", update); document.documentElement.style.removeProperty("--app-height"); };
  }, []);

  useEffect(() => {
    const onFocus = () => reconcileWorld(true);
    const onVisibility = () => { if (document.visibilityState === "visible") reconcileWorld(true); };
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") reconcileWorld(false); }, 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); };
  }, [reconcileWorld]);

  // No automatic photo generation on login or tab switches. Chat photography is unchanged.
  useEffect(() => {
    if (isFirebaseConfigured && authStatus !== "signed_in") {
      setPlayerProfile(null); setWallet(null); setPlayerLoading(false); return;
    }
    let alive = true;
    setPlayerLoading(true); setPlayerError(null);
    void Promise.all([loadPlayerProfile(uid), loadVirtualWallet(uid)])
      .then(([profile, credits]) => { if (alive) { setPlayerProfile(profile); setWallet(credits); } })
      .catch(error => { if (alive) setPlayerError(error instanceof Error ? error.message : "Не удалось загрузить профиль"); })
      .finally(() => { if (alive) setPlayerLoading(false); });
    return () => { alive = false; };
  }, [uid, authStatus]);

  const openChat = (characterId: string) => {
    if (!isKnownCharacterId(characterId)) return;
    setPage("chat");
    if (activeCharacterId !== characterId) void selectCharacter(characterId);
  };
  const saveProfile = async (draft: PlayerProfile) => {
    if (playerBusy) return;
    setPlayerBusy(true); setPlayerError(null);
    try { setPlayerProfile(await savePlayerProfile(uid, draft)); }
    catch (error) { setPlayerError(error instanceof Error ? error.message : "Не удалось сохранить профиль"); }
    finally { setPlayerBusy(false); }
  };
  const spend = async (item: Spend): Promise<boolean> => {
    if (playerBusy || !ready || busy || !wallet || !isKnownCharacterId(item.characterId)) return false;
    const valid = item.kind === "gift"
      ? GIFT_CATALOG.some(entry => entry.label === item.label && entry.price === item.amount)
      : item.label === "Виртуальный перевод" && TRANSFER_AMOUNTS.some(entry => entry === item.amount);
    if (!valid) { setPlayerError("Товар или сумма недействительны."); return false; }
    setPlayerBusy(true); setPlayerError(null);
    try {
      const next = await spendVirtualCurrency(uid, {
        id: crypto.randomUUID(), kind: item.kind, characterId: item.characterId,
        label: item.label, amount: item.amount, createdAt: Date.now(),
      });
      setWallet(next);
      // Delivery is a real chat event; the girl's reaction is not forced by the transaction.
      const text = item.kind === "gift"
        ? `[Виртуальное событие: я отправил тебе подарок «${item.label}», потратил ${item.amount} игровых монет. Ты сама решаешь, как отреагировать.]`
        : `[Виртуальное событие: я перевёл тебе ${item.amount} игровых монет. Это не реальные деньги; ты сама решаешь, как отреагировать.]`;
      if (activeCharacterId !== item.characterId) await selectCharacter(item.characterId);
      setPage("chat");
      await useAppStore.getState().send(text);
      return true;
    } catch (error) {
      setPlayerError(error instanceof Error ? error.message : "Операция не выполнена");
      return false;
    } finally { setPlayerBusy(false); }
  };

  if (isFirebaseConfigured && authStatus === "signed_out") {
    return <AuthGate busy={busy} error={error} onSignIn={() => void signIn()} />;
  }

  const status = initializing ? "Подключение…" : busy ? "Пишет сообщение…" :
    !ready ? "Не в сети" : runtime?.world.isAwake === false ? "Спит" : "На связи";
  return <main className="social-app-shell alex-shell">
    <header className="alex-header">
      <button className="alex-header-avatar alex-avatar-button" type="button" onClick={() => setPage("people")}>{character.core.name.charAt(0)}</button>
      <div className="alex-header-copy"><strong>{page === "profile" ? "Мой профиль" : page === "people" ? "Люди" : page === "social" ? "Соцсеть" : character.core.name}</strong>
        <span>{page === "chat" ? <><i className={ready ? "alex-status-dot" : "alex-status-dot offline"}/>{status}</> : "Game2 · виртуальный мир"}</span></div>
      <button className="alex-settings-button" type="button" aria-label="Настройки" onClick={() => setPage(page === "settings" ? "chat" : "settings")}><Icon name={page === "settings" ? "close" : "settings"} size={21}/></button>
    </header>
    {runtimeConfigurationError && <div className="alex-inline-error" role="status">{runtimeConfigurationError}</div>}
    {error && <div className="error-banner social-error-banner"><span>{error}</span><button type="button" onClick={() => { clearError(); if (!ready) void initialize(); }}>{ready ? "×" : "Повторить"}</button></div>}
    {playerError && <div className="alex-inline-error" role="alert">{playerError} <button type="button" onClick={() => setPlayerError(null)}>×</button></div>}
    <div className={`social-content alex-content ${page === "chat" ? "chat-content" : ""}`}>
      {page === "chat" && <ChatScreen characterName={character.core.name} messages={messages}
        ready={ready} busy={busy} onSend={send} draft={chatDraft} onDraftChange={setChatDraft}
        onRetry={retry} onRetryPhoto={retryPhoto} onDismissFailed={dismissFailed}
        hasOlderMessages={hasOlderMessages} loadingOlder={loadingOlder} onLoadOlder={loadOlder} />}
      {page === "people" && <PeopleScreen wallet={wallet} walletBusy={playerBusy} ready={ready} onChat={openChat} onSpend={spend}/>}
      {page === "social" && <AlexandraSocial onMessage={() => openChat("alexandra_v1")} onMyProfile={() => setPage("profile")} playerProfile={playerProfile}/>}
      {page === "profile" && <MyProfile profile={playerProfile} wallet={wallet} loading={playerLoading} saving={playerBusy} onSave={saveProfile} />}
      {page === "settings" && <Suspense fallback={<div className="alex-loading">Настройки…</div>}>
        <SettingsScreen characterName={character.core.name} firebaseEnabled={isFirebaseConfigured && !runtimeConfigurationError}
          onClose={() => setPage("profile")} appCheckState={appCheckState} user={user} trace={lastTrace}
          maintenanceError={maintenanceError} onSignOut={() => void signOut()}
          onClearConversationAndMemory={clearConversationAndMemory} clearingData={resettingData}
          resetDisabled={!ready || resettingData} personality={editablePersonality}
          memory={editableMemory} photoNoRefusalMode={photoNoRefusalMode}
          contextUpdatedAt={editableContextUpdatedAt} contextBusy={editableContextBusy}
          onReloadContext={loadEditableContext} onSavePersonality={saveEditablePersonality}
          onSaveMemory={saveEditableMemory} onSetPhotoNoRefusalMode={setPhotoNoRefusalMode}
          exportBusy={exportBusy} onExportConversation={exportConversation} />
      </Suspense>}
    </div>
    {page !== "settings" && <nav className="social-bottom-nav alex-bottom-nav" aria-label="Навигация">
      <button type="button" className={page === "chat" ? "active" : ""} onClick={() => setPage("chat")}><Icon name="chat" size={21}/><span>Чат</span></button>
      <button type="button" className={page === "people" ? "active" : ""} onClick={() => setPage("people")}><Icon name="together" size={21}/><span>Люди</span></button>
      <button type="button" className={page === "social" ? "active" : ""} onClick={() => setPage("social")}><Icon name="look" size={21}/><span>Соцсеть</span></button>
      <button type="button" className={page === "profile" ? "active" : ""} onClick={() => setPage("profile")}><Icon name="settings" size={21}/><span>Профиль</span></button>
    </nav>}
  </main>;
}
