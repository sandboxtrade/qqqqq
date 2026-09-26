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

type SettingsView = "home" | "personality" | "memory" | "export";

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

function compactPreview(text: string, max = 92) {
  const clean = text.replace(/\s+/gu, " ").trim();
  if (!clean) return "Пока пусто";
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function SettingsScreen({
  firebaseEnabled,
  appCheckState,
  user,
  trace,
  onClose,
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
  onClose: () => void;
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
  const [view, setView] = useState<SettingsView>("home");
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmAdultMode, setConfirmAdultMode] = useState(false);
  const [personalityDraft, setPersonalityDraft] = useState(personality);
  const [memoryDraft, setMemoryDraft] = useState(memory);
  const [exportText, setExportText] = useState("");
  const [exportLabel, setExportLabel] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");
  const [pasteState, setPasteState] = useState<"idle" | "ok" | "error">("idle");

  useEffect(() => setPersonalityDraft(personality), [personality]);
  useEffect(() => setMemoryDraft(memory), [memory]);

  const dialogueEngineLabel = useMemo(() => {
    if (!trace) return firebaseEnabled ? "ожидание" : "local";
    if (trace.cloudLanguage?.used) return `GPT · ${trace.cloudLanguage.model ?? "cloud"}`;
    if (trace.cloudLanguage?.attempted)
      return `LOCAL · ${trace.cloudLanguage?.reason ?? "fallback"}`;
    return "LOCAL";
  }, [firebaseEnabled, trace]);

  const contextDate = contextUpdatedAt
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(contextUpdatedAt)
    : "ещё не сохранялась";

  const copyExport = async () => {
    if (!exportText) return;
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyState("ok");
    } catch {
      setCopyState("error");
    }
  };

  const pasteIntoEditor = async (target: "personality" | "memory") => {
    setPasteState("idle");
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      if (target === "personality") setPersonalityDraft(text.slice(0, MAX_PERSONALITY_CHARS));
      else setMemoryDraft(text.slice(0, MAX_MEMORY_CHARS));
      setPasteState("ok");
    } catch {
      setPasteState("error");
    }
  };

  const runExport = async (limit: ConversationExportLimit, label: string) => {
    setCopyState("idle");
    const text = await onExportConversation(limit);
    if (!text) return;
    setExportText(text);
    setExportLabel(label);
    setView("export");
  };

  if (view === "personality" || view === "memory") {
    const editingPersonality = view === "personality";
    const draft = editingPersonality ? personalityDraft : memoryDraft;
    const saved = editingPersonality ? personality : memory;
    const max = editingPersonality ? MAX_PERSONALITY_CHARS : MAX_MEMORY_CHARS;
    const title = editingPersonality ? "Личность Yuzuki" : "Память Yuzuki";
    const note = editingPersonality
      ? "Характер, манера речи, привычки и границы. Этот текст читается перед каждым ответом."
      : "Совместная история и важные воспоминания. Сюда можно вставить обновлённую сводку целиком.";

    const save = async () => {
      const ok = editingPersonality
        ? await onSavePersonality(personalityDraft)
        : await onSaveMemory(memoryDraft);
      if (ok) setView("home");
    };

    const cancel = () => {
      if (editingPersonality) setPersonalityDraft(saved);
      else setMemoryDraft(saved);
      setPasteState("idle");
      setView("home");
    };

    return (
      <section className="settings-screen settings-editor-view">
        <div className="settings-editor-toolbar">
          <button className="settings-back-button" type="button" onClick={cancel} disabled={contextBusy}>
            Назад
          </button>
          <div>
            <strong>{title}</strong>
            <span>{draft.length.toLocaleString("ru-RU")} / {max.toLocaleString("ru-RU")}</span>
          </div>
          <button className="settings-save-button" type="button" onClick={() => void save()} disabled={contextBusy || draft === saved}>
            {contextBusy ? "…" : "Сохранить"}
          </button>
        </div>

        <p className="settings-editor-note">{note}</p>

        <textarea
          className="settings-full-editor"
          value={draft}
          maxLength={max}
          disabled={contextBusy}
          autoFocus
          spellCheck
          placeholder={editingPersonality ? "Опиши Yuzuki…" : "Вставь сюда сводку памяти…"}
          onChange={(event) => {
            if (editingPersonality) setPersonalityDraft(event.target.value);
            else setMemoryDraft(event.target.value);
            setPasteState("idle");
          }}
        />

        <div className="settings-editor-footer">
          <button type="button" disabled={contextBusy} onClick={() => void pasteIntoEditor(view)}>
            Вставить
          </button>
          <span>
            {pasteState === "ok" ? "Вставлено" : pasteState === "error" ? "Буфер недоступен" : "Переносы строк сохраняются"}
          </span>
        </div>
      </section>
    );
  }

  if (view === "export") {
    return (
      <section className="settings-screen settings-editor-view settings-export-view">
        <div className="settings-editor-toolbar">
          <button className="settings-back-button" type="button" onClick={() => setView("home")}>Назад</button>
          <div>
            <strong>Экспорт диалога</strong>
            <span>{exportLabel}</span>
          </div>
          <button className="settings-save-button" type="button" onClick={() => void copyExport()}>
            {copyState === "ok" ? "Готово" : copyState === "error" ? "Ошибка" : "Копировать"}
          </button>
        </div>
        <p className="settings-editor-note">Чистая переписка USER/YUZUKI без технических событий.</p>
        <textarea className="settings-full-editor settings-export-editor" value={exportText} readOnly />
        <div className="settings-editor-footer">
          <button type="button" onClick={() => downloadText(exportText)}>Скачать .txt</button>
          <span>{exportText.length.toLocaleString("ru-RU")} символов</span>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-screen settings-home">
      <header className="settings-topbar">
        <button className="settings-icon-button" type="button" onClick={onClose} aria-label="Закрыть настройки">
          ←
        </button>
        <div>
          <strong>Настройки</strong>
          <span>Yuzuki</span>
        </div>
        <button
          className="settings-icon-button"
          type="button"
          disabled={contextBusy}
          onClick={() => void onReloadContext()}
          aria-label="Обновить данные"
        >
          {contextBusy ? "…" : "↻"}
        </button>
      </header>

      <div className="settings-scroll">
        <section className="settings-group">
          <div className="settings-group-head">
            <h3>Личность и память</h3>
            <span>{contextDate}</span>
          </div>
          <div className="settings-list-card">
            <button className="settings-row" type="button" onClick={() => setView("personality")}>
              <div className="settings-row-copy">
                <strong>Личность Yuzuki</strong>
                <span>{compactPreview(personality)}</span>
              </div>
              <div className="settings-row-side">
                <small>{personality.length.toLocaleString("ru-RU")} / {MAX_PERSONALITY_CHARS.toLocaleString("ru-RU")}</small>
                <b>›</b>
              </div>
            </button>
            <button className="settings-row" type="button" onClick={() => setView("memory")}>
              <div className="settings-row-copy">
                <strong>Память Yuzuki</strong>
                <span>{compactPreview(memory)}</span>
              </div>
              <div className="settings-row-side">
                <small>{memory.length.toLocaleString("ru-RU")} / {MAX_MEMORY_CHARS.toLocaleString("ru-RU")}</small>
                <b>›</b>
              </div>
            </button>
          </div>
        </section>

        <section className="settings-group">
          <div className="settings-group-head">
            <h3>Экспорт диалога</h3>
            <span>для обновления памяти</span>
          </div>
          <div className="settings-list-card settings-export-card">
            <p>Сколько последних сообщений выгрузить?</p>
            <div className="settings-export-grid">
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
          </div>
        </section>

        <section className="settings-group">
          <div className="settings-group-head">
            <h3>Близость</h3>
          </div>
          <div className="settings-list-card settings-mode-card">
            <div className="settings-mode-row">
              <div>
                <strong>Интимный режим 18+</strong>
                <span>Стоп, пауза и границы всегда имеют приоритет.</span>
              </div>
              <span className={intimacyEnabled ? "settings-state-pill active" : "settings-state-pill"}>
                {intimacyEnabled ? intimacyPhaseLabels[intimacyPhase] : "выкл"}
              </span>
            </div>
            {intimacyEnabled ? (
              <button className="settings-action-button" type="button" disabled={intimacyUpdating || clearingData} onClick={() => void onSetIntimacyEnabled(false)}>
                {intimacyUpdating ? "Сохраняем…" : "Выключить"}
              </button>
            ) : !confirmAdultMode ? (
              <button className="settings-action-button" type="button" disabled={intimacyUpdating || clearingData} onClick={() => setConfirmAdultMode(true)}>
                Включить
              </button>
            ) : (
              <div className="settings-confirmation" role="alert">
                <span>Только для пользователей 18+.</span>
                <div>
                  <button type="button" disabled={intimacyUpdating} onClick={() => setConfirmAdultMode(false)}>Отмена</button>
                  <button type="button" disabled={intimacyUpdating} onClick={() => void onSetIntimacyEnabled(true).finally(() => setConfirmAdultMode(false))}>
                    {intimacyUpdating ? "…" : "Мне 18+"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="settings-group">
          <details className="settings-details-card">
            <summary>
              <span>Диагностика и подключение</span>
              <b>›</b>
            </summary>
            <div className="settings-diagnostics-body">
              <div className="setting-row"><span>Аккаунт</span><strong>{user?.email ?? "Локальный пользователь"}</strong></div>
              <div className="setting-row"><span>Firebase</span><strong>{firebaseEnabled ? "подключён" : "локальный режим"}</strong></div>
              <div className="setting-row"><span>App Check</span><strong>{appCheckLabels[appCheckState]}</strong></div>
              <div className="setting-row"><span>Диалог</span><strong>{dialogueEngineLabel}</strong></div>
              <div className="setting-row"><span>Контекст GPT</span><strong>Personality + Memory + 15/15</strong></div>
              {trace?.timings && (
                <>
                  <div className="settings-diagnostics-divider" />
                  <div className="setting-row"><span>До первого текста</span><strong>{trace.timings.firstTextMs === null ? "без реплики" : `${(trace.timings.firstTextMs / 1000).toFixed(1)} с`}</strong></div>
                  <div className="setting-row"><span>Формулировка</span><strong>{(trace.timings.generationMs / 1000).toFixed(1)} с</strong></div>
                  <div className="setting-row"><span>Всего</span><strong>{(trace.timings.totalMs / 1000).toFixed(1)} с</strong></div>
                </>
              )}
              {maintenanceError && <div className="error-card">Фоновое состояние: {maintenanceError}</div>}
              <DebugPanel trace={trace} />
            </div>
          </details>
        </section>

        <section className="settings-group">
          <div className="settings-list-card settings-danger-card">
            <div className="settings-danger-copy">
              <strong>Очистить диалог и память</strong>
              <span>История и Memory удалятся. Personality останется.</span>
            </div>
            {!confirmReset ? (
              <button className="settings-danger-button" type="button" disabled={resetDisabled} onClick={() => setConfirmReset(true)}>
                Очистить
              </button>
            ) : (
              <div className="settings-confirmation" role="alert">
                <span>Это действие необратимо.</span>
                <div>
                  <button type="button" disabled={clearingData} onClick={() => setConfirmReset(false)}>Отмена</button>
                  <button className="settings-danger-button" type="button" disabled={resetDisabled} onClick={() => void onClearConversationAndMemory().finally(() => setConfirmReset(false))}>
                    {clearingData ? "Очищаем…" : "Удалить всё"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {user && (
          <button className="settings-signout" type="button" onClick={onSignOut} disabled={clearingData}>
            Выйти из Google
          </button>
        )}
      </div>
    </section>
  );
}
