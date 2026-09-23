import type { AppCheckState } from "../../storage/firebase";
import type { AuthProfile } from "../../storage/auth";
import type { RuntimeTrace } from "../../engine/runtime";
import { DebugPanel } from "../components/DebugPanel";

const appCheckLabels: Record<AppCheckState, string> = {
  checking: "проверяется",
  disabled: "не используется",
  missing_site_key: "нужен site key",
  debug: "debug mode",
  active: "защищён",
  error: "ошибка",
};

export function SettingsScreen({
  firebaseEnabled,
  appCheckState,
  user,
  trace,
  onSignOut,
  maintenanceError,
}: {
  firebaseEnabled: boolean;
  appCheckState: AppCheckState;
  user: AuthProfile | null;
  trace: RuntimeTrace | null;
  onSignOut: () => void;
  maintenanceError: string | null;
}) {
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
            {trace
              ? trace.responseGuardFallback
                ? "local + guard fallback"
                : "local"
              : "local"}
          </strong>
        </div>
        <div className="setting-row">
          <span>Аккаунт</span>
          <strong>{user?.email ?? "не используется"}</strong>
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
      {user && (
        <button className="secondary-button" type="button" onClick={onSignOut}>
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
