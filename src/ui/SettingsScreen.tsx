import { useState } from "react";
import type { AppCheckState } from "../storage/firebase";
import type { AuthProfile } from "../storage/auth";
import type { RuntimeTrace } from "../engine/runtime";
import type { IntimacyPhase } from "../intimacy/intimacy";
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
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmAdultMode, setConfirmAdultMode] = useState(false);
  return (
    <section className="panel-screen settings-screen">
      <div className="section-heading">
        <span className="eyebrow">SYSTEM</span>
        <h2>Состояние приложения</h2>
        <p>Технические вещи вынесены сюда и не мешают основному общению.</p>
      </div>
      <div className="settings-list">
        <div className="setting-row">
          <span>Firebase</span>
          <strong>{firebaseEnabled ? "подключён" : "локальный режим"}</strong>
        </div>
        <div className="setting-row">
          <span>App Check</span>
          <strong>{appCheckLabels[appCheckState]}</strong>
        </div>
        <div className="setting-row">
          <span>Dialogue Engine</span>
          <strong>
            {trace?.cloudLanguage?.used
              ? `GPT${trace.cloudLanguage.model ? ` · ${trace.cloudLanguage.model}` : ""}`
              : trace?.cloudLanguage
                ? `local fallback · ${trace.cloudLanguage.reason ?? "unknown"}`
                : "ожидает первого ответа"}
          </strong>
        </div>
        <div className="setting-row">
          <span>Аккаунт</span>
          <strong>{user?.email ?? "не используется"}</strong>
        </div>
      </div>
      <div className="settings-intimacy-zone">
        <div className="settings-intimacy-copy">
          <strong>Интимный режим 18+</strong>
          <span>
            Подключает отдельный intimacy-state к Local Brain: близость развивается постепенно, учитывает отношения, настроение, приватность и текущие границы. Стоп и пауза имеют безусловный приоритет.
          </span>
        </div>
        <div className="settings-intimacy-status">
          <span>{intimacyEnabled ? `включён · ${intimacyPhaseLabels[intimacyPhase]}` : "выключен"}</span>
          {intimacyEnabled ? (
            <button
              type="button"
              disabled={intimacyUpdating || clearingData}
              onClick={() => void onSetIntimacyEnabled(false)}
            >
              {intimacyUpdating ? "Сохраняем…" : "Выключить"}
            </button>
          ) : !confirmAdultMode ? (
            <button
              type="button"
              disabled={intimacyUpdating || clearingData}
              onClick={() => setConfirmAdultMode(true)}
            >
              Включить
            </button>
          ) : (
            <div className="intimacy-confirmation" role="alert">
              <span>Режим предназначен только для взрослых пользователей.</span>
              <div>
                <button type="button" disabled={intimacyUpdating} onClick={() => setConfirmAdultMode(false)}>Отмена</button>
                <button
                  type="button"
                  disabled={intimacyUpdating}
                  onClick={() => void onSetIntimacyEnabled(true).finally(() => setConfirmAdultMode(false))}
                >
                  {intimacyUpdating ? "Сохраняем…" : "Мне 18+ · включить"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {trace?.timings && (
        <div className="settings-list">
          <div className="setting-row"><span>До первого текста</span><strong>{trace.timings.firstTextMs === null ? "без реплики" : `${(trace.timings.firstTextMs / 1000).toFixed(1)} с`}</strong></div>
          <div className="setting-row"><span>Контекст и память</span><strong>{((trace.timings.preflightMs + trace.timings.contextMs) / 1000).toFixed(1)} с</strong></div>
          <div className="setting-row"><span>Формулировка ответа</span><strong>{(trace.timings.generationMs / 1000).toFixed(1)} с</strong></div>
          <div className="setting-row"><span>Сохранение</span><strong>{(trace.timings.saveMs / 1000).toFixed(1)} с</strong></div>
          <div className="setting-row"><span>Всего</span><strong>{(trace.timings.totalMs / 1000).toFixed(1)} с</strong></div>
        </div>
      )}
      <div className="settings-danger-zone">
        <div className="settings-danger-copy">
          <strong>Очистить диалог и память</strong>
          <span>
            Удалит историю общения, память, факты, незакрытые темы и связанные состояния Yuzuki. Аккаунт и Firebase останутся подключены.
          </span>
        </div>
        {!confirmReset ? (
          <button
            className="danger-button"
            type="button"
            disabled={resetDisabled}
            onClick={() => setConfirmReset(true)}
          >
            Очистить диалог и память
          </button>
        ) : (
          <div className="danger-confirmation" role="alert">
            <span>Это действие необратимо. Yuzuki начнёт общение с чистой памятью.</span>
            <div className="danger-confirmation-actions">
              <button type="button" disabled={clearingData} onClick={() => setConfirmReset(false)}>Отмена</button>
              <button
                className="danger-button"
                type="button"
                disabled={resetDisabled}
                onClick={() => void onClearConversationAndMemory().finally(() => setConfirmReset(false))}
              >
                {clearingData ? "Очищаем…" : "Удалить всё"}
              </button>
            </div>
          </div>
        )}
      </div>
      {user && (
        <button className="secondary-button" type="button" onClick={onSignOut} disabled={clearingData}>
          Выйти из Google
        </button>
      )}
      {maintenanceError && (
        <div className="error-card">Обработка памяти: {maintenanceError}</div>
      )}
      <DebugPanel trace={trace} />
    </section>
  );
}
