import { useEffect, useMemo, useState } from "react";
import type { AppCheckState } from "../storage/firebase";
import type { AuthProfile } from "../storage/auth";
import type { RuntimeTrace } from "../engine/runtime";
import type { IntimacyPhase } from "../intimacy/intimacy";
import type { ConversationExportLimit } from "../chat/conversation-export";
import { MAX_MEMORY_CHARS, MAX_PERSONALITY_CHARS } from "../context/yuzuki-context";
import { DebugPanel } from "./components";

const appCheckLabels: Record<AppCheckState, string> = {
  checking: "проверяется",
  disabled: "не используется",
  missing_site_key: "нужен site key",
  debug: "debug mode",
  active: "защищён",
  error: "ошибка",
};

const intimacyPhaseLabels: Record<IntimacyPhase, string> = {
  normal: "спокойно",
  romantic: "романтика",
  close: "близость",
  intimate: "интимно",
  high_intimacy: "сильное влечение",
  aftercare: "нежность",
  paused: "пауза",
};

const exportOptions: Array<{ value: ConversationExportLimit; label: string }> = [
  { value: 20, label: "20" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 200, label: "200" },
  { value: "all", label: "Весь диалог" },
];

function downloadText(text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `yuzuki-dialogue-${date}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function SettingsScreen({
  firebaseEnabled,
  appCheckState,
  user,
  trace,
  onSignOut,
  onClearConversationAndMemory,
  clearingData,
  resetDisabled,
  maintenanceError,
  intimacyEnabled,
  intimacyPhase,
  intimacyUpdating,
  onSetIntimacyEnabled,
  personality,
  memory,
  contextUpdatedAt,
  contextBusy,
  onReloadContext,
  onSavePersonality,
  onSaveMemory,
  exportBusy,
  onExportConversation,
}: {
  firebaseEnabled: boolean;
  appCheckState: AppCheckState;
  user: AuthProfile | null;
  trace: RuntimeTrace | null;
  onSignOut: () => void;
  onClearConversationAndMemory: () => Promise<void>;
  clearingData: boolean;
  resetDisabled: boolean;
  maintenanceError: string | null;
  intimacyEnabled: boolean;
  intimacyPhase: IntimacyPhase;
  intimacyUpdating: boolean;
  onSetIntimacyEnabled: (enabled: boolean) => Promise<void>;
  personality: string;
  memory: string;
  contextUpdatedAt: number;
  contextBusy: boolean;
  onReloadContext: () => Promise<void>;
  onSavePersonality: (text: string) => Promise<boolean>;
  onSaveMemory: (text: string) => Promise<boolean>;
  exportBusy: boolean;
  onExportConversation: (limit: ConversationExportLimit) => Promise<string>;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmAdultMode, setConfirmAdultMode] = useState(false);
  const [personalityDraft, setPersonalityDraft] = useState(personality);
  const [memoryDraft, setMemoryDraft] = useState(memory);
  const [editingPersonality, setEditingPersonality] = useState(false);
  const [editingMemory, setEditingMemory] = useState(false);
  const [exportText, setExportText] = useState("");
  const [exportLabel, setExportLabel] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");

  useEffect(() => setPersonalityDraft(personality), [personality]);
  useEffect(() => setMemoryDraft(memory), [memory]);

  const dialogueEngineLabel = useMemo(() => {
    if (!trace) return firebaseEnabled ? "ожидание" : "local";
    if (trace.cloudLanguage?.used) return `GPT · ${trace.cloudLanguage.model ?? "cloud"}`;
    if (trace.cloudLanguage?.attempted) {
      return `LOCAL · ${trace.cloudLanguage?.reason ?? "fallback"}`;
    }
    return "LOCAL";
  }, [firebaseEnabled, trace]);

  const contextDate = contextUpdatedAt
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(contextUpdatedAt)
    : "ещё не сохранялся";

  const runExport = async (limit: ConversationExportLimit, label: string) => {
    setCopyState("idle");
    const text = await onExportConversation(limit);
    setExportText(text);
    setExportLabel(text ? label : "");
  };

  const copyExport = async () => {
    if (!exportText) return;
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyState("ok");
    } catch {
      setCopyState("error");
    }
  };

  return (
    <section className="panel-screen settings-screen">
      <div className="section-heading">
        <span className="eyebrow">SYSTEM</span>
        <h2>Yuzuki</h2>
        <p>Ручная личность и память — единственный долговременный контекст, который GPT читает перед ответом.</p>
      </div>

      <div className="settings-hero-card">
        <div>
          <strong>{user?.email ?? "Локальный пользователь"}</strong>
          <span>
            {firebaseEnabled
              ? "Состояние и ручной контекст синхронизируются через Firestore."
              : "Сейчас включён локальный режим без облачной синхронизации."}
          </span>
        </div>
        <span className="settings-hero-badge">{dialogueEngineLabel}</span>
      </div>

      <div className="manual-context-card">
        <div className="manual-context-head">
          <div>
            <strong>Личность Yuzuki</strong>
            <span>Стабильный характер и манера общения. GPT читает этот текст перед каждым ответом.</span>
          </div>
          <span>{personality.length.toLocaleString("ru-RU")} / {MAX_PERSONALITY_CHARS.toLocaleString("ru-RU")}</span>
        </div>
        {editingPersonality ? (
          <>
            <textarea
              className="manual-context-editor personality-editor"
              value={personalityDraft}
              maxLength={MAX_PERSONALITY_CHARS}
              disabled={contextBusy}
              onChange={(event) => setPersonalityDraft(event.target.value)}
            />
            <div className="manual-context-actions">
              <button type="button" disabled={contextBusy} onClick={() => {
                setPersonalityDraft(personality);
                setEditingPersonality(false);
              }}>Отмена</button>
              <button type="button" disabled={contextBusy} onClick={() =>
                void onSavePersonality(personalityDraft).then((saved) => {
                  if (saved) setEditingPersonality(false);
                })
              }>{contextBusy ? "Сохраняем…" : "Сохранить личность"}</button>
            </div>
          </>
        ) : (
          <>
            <pre className="manual-context-preview">{personality || "Личность не задана."}</pre>
            <div className="manual-context-actions">
              <button type="button" disabled={contextBusy} onClick={() => void onReloadContext()}>Обновить</button>
              <button type="button" disabled={contextBusy} onClick={() => setEditingPersonality(true)}>Редактировать</button>
            </div>
          </>
        )}
      </div>

      <div className="manual-context-card">
        <div className="manual-context-head">
          <div>
            <strong>Память Yuzuki</strong>
            <span>Каноническая ручная сводка: факты, ваши моменты, её воспоминания, мысли и отношение к пережитому.</span>
          </div>
          <span>{memory.length.toLocaleString("ru-RU")} / {MAX_MEMORY_CHARS.toLocaleString("ru-RU")}</span>
        </div>
        {editingMemory ? (
          <>
            <textarea
              className="manual-context-editor memory-editor"
              value={memoryDraft}
              maxLength={MAX_MEMORY_CHARS}
              disabled={contextBusy}
              placeholder="Вставь сюда подготовленную сводку памяти. Пустое поле означает: долговременной памяти нет."
              onChange={(event) => setMemoryDraft(event.target.value)}
            />
            <div className="manual-context-actions">
              <button type="button" disabled={contextBusy} onClick={() => {
                setMemoryDraft(memory);
                setEditingMemory(false);
              }}>Отмена</button>
              <button type="button" disabled={contextBusy} onClick={() =>
                void onSaveMemory(memoryDraft).then((saved) => {
                  if (saved) setEditingMemory(false);
                })
              }>{contextBusy ? "Сохраняем…" : "Сохранить память"}</button>
            </div>
          </>
        ) : (
          <>
            <pre className="manual-context-preview memory-preview">{memory || "Память пока пустая."}</pre>
            <div className="manual-context-actions">
              <span className="manual-context-meta">обновлено: {contextDate}</span>
              <button type="button" disabled={contextBusy} onClick={() => setEditingMemory(true)}>Редактировать</button>
            </div>
          </>
        )}
      </div>

      <div className="conversation-export-card">
        <div className="manual-context-head">
          <div>
            <strong>Экспорт диалога</strong>
            <span>Выгружает только USER/YUZUKI без технических событий. Отправь этот текст в ChatGPT для новой сводки памяти.</span>
          </div>
        </div>
        <div className="export-choice-row">
          {exportOptions.map((option) => (
            <button
              type="button"
              key={String(option.value)}
              disabled={exportBusy}
              onClick={() => void runExport(option.value, option.label)}
            >
              {exportBusy ? "…" : option.label}
            </button>
          ))}
        </div>
        {exportText && (
          <>
            <textarea className="conversation-export-preview" value={exportText} readOnly />
            <div className="manual-context-actions">
              <span className="manual-context-meta">{exportLabel}</span>
              <button type="button" onClick={() => void copyExport()}>
                {copyState === "ok" ? "Скопировано" : copyState === "error" ? "Не удалось" : "Скопировать"}
              </button>
              <button type="button" onClick={() => downloadText(exportText)}>Скачать .txt</button>
            </div>
          </>
        )}
      </div>

      <div className="settings-list">
        <div className="setting-row"><span>Firebase</span><strong>{firebaseEnabled ? "подключён" : "локальный режим"}</strong></div>
        <div className="setting-row"><span>App Check</span><strong>{appCheckLabels[appCheckState]}</strong></div>
        <div className="setting-row"><span>Диалог</span><strong>{dialogueEngineLabel}</strong></div>
        <div className="setting-row"><span>Контекст GPT</span><strong>ручная память + до 15/15 сообщений</strong></div>
        <div className="setting-row"><span>Старая auto-memory</span><strong>не участвует в ответах</strong></div>
      </div>

      <div className="settings-intimacy-zone">
        <div className="settings-intimacy-copy">
          <strong>Интимный режим 18+</strong>
          <span>
            Состояние близости остаётся механическим. Стоп, пауза и границы имеют безусловный приоритет.
          </span>
        </div>
        <div className="settings-intimacy-status">
          <span>{intimacyEnabled ? `включён · ${intimacyPhaseLabels[intimacyPhase]}` : "выключен"}</span>
          {intimacyEnabled ? (
            <button type="button" disabled={intimacyUpdating || clearingData} onClick={() => void onSetIntimacyEnabled(false)}>
              {intimacyUpdating ? "Сохраняем…" : "Выключить"}
            </button>
          ) : !confirmAdultMode ? (
            <button type="button" disabled={intimacyUpdating || clearingData} onClick={() => setConfirmAdultMode(true)}>Включить</button>
          ) : (
            <div className="intimacy-confirmation" role="alert">
              <span>Режим предназначен только для взрослых пользователей.</span>
              <div>
                <button type="button" disabled={intimacyUpdating} onClick={() => setConfirmAdultMode(false)}>Отмена</button>
                <button type="button" disabled={intimacyUpdating} onClick={() =>
                  void onSetIntimacyEnabled(true).finally(() => setConfirmAdultMode(false))
                }>{intimacyUpdating ? "Сохраняем…" : "Мне 18+ · включить"}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {trace?.timings && (
        <div className="settings-list timings-list">
          <div className="setting-row"><span>До первого текста</span><strong>{trace.timings.firstTextMs === null ? "без реплики" : `${(trace.timings.firstTextMs / 1000).toFixed(1)} с`}</strong></div>
          <div className="setting-row"><span>Контекст</span><strong>{((trace.timings.preflightMs + trace.timings.contextMs) / 1000).toFixed(1)} с</strong></div>
          <div className="setting-row"><span>Формулировка ответа</span><strong>{(trace.timings.generationMs / 1000).toFixed(1)} с</strong></div>
          <div className="setting-row"><span>Сохранение</span><strong>{(trace.timings.saveMs / 1000).toFixed(1)} с</strong></div>
          <div className="setting-row"><span>Всего</span><strong>{(trace.timings.totalMs / 1000).toFixed(1)} с</strong></div>
        </div>
      )}

      <div className="settings-danger-zone">
        <div className="settings-danger-copy">
          <strong>Очистить диалог и память</strong>
          <span>Удалит историю общения и ручную память. Текст личности Yuzuki сохранится.</span>
        </div>
        {!confirmReset ? (
          <button className="danger-button" type="button" disabled={resetDisabled} onClick={() => setConfirmReset(true)}>Очистить диалог и память</button>
        ) : (
          <div className="danger-confirmation" role="alert">
            <span>Это действие необратимо. История и ручная память будут очищены.</span>
            <div className="danger-confirmation-actions">
              <button type="button" disabled={clearingData} onClick={() => setConfirmReset(false)}>Отмена</button>
              <button className="danger-button" type="button" disabled={resetDisabled} onClick={() =>
                void onClearConversationAndMemory().finally(() => setConfirmReset(false))
              }>{clearingData ? "Очищаем…" : "Удалить всё"}</button>
            </div>
          </div>
        )}
      </div>

      {user && <button className="secondary-button" type="button" onClick={onSignOut} disabled={clearingData}>Выйти из Google</button>}
      {maintenanceError && <div className="error-card">Фоновое состояние: {maintenanceError}</div>}
      <DebugPanel trace={trace} />
    </section>
  );
}
