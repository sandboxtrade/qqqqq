import type { AppCheckState } from '../../storage/firebase';
import type { AuthProfile } from '../../storage/auth';
import type { RuntimeTrace } from '../../engine/runtime';
import { DebugPanel } from '../components/DebugPanel';

const appCheckLabels: Record<AppCheckState, string> = {
  disabled: 'не используется',
  missing_site_key: 'нужен site key',
  debug: 'debug mode',
  active: 'защищён',
  error: 'ошибка',
};

export function SettingsScreen({
  firebaseEnabled,
  appCheckState,
  user,
  trace,
  onSignOut,
}: {
  firebaseEnabled: boolean;
  appCheckState: AppCheckState;
  user: AuthProfile | null;
  trace: RuntimeTrace | null;
  onSignOut: () => void;
}) {
  return (
    <section className="panel-screen settings-screen">
      <div className="section-heading"><span className="eyebrow">SYSTEM</span><h2>Состояние приложения</h2><p>Технические вещи вынесены сюда и не мешают основному общению.</p></div>
      <div className="settings-list">
        <div className="setting-row"><span>Firebase</span><strong>{firebaseEnabled ? 'подключён' : 'локальный режим'}</strong></div>
        <div className="setting-row"><span>App Check</span><strong>{appCheckLabels[appCheckState]}</strong></div>
        <div className="setting-row"><span>Gemini</span><strong>{trace ? (trace.usedGeminiReply ? 'ответил' : 'fallback') : firebaseEnabled ? 'готов к проверке' : 'fallback'}</strong></div>
        <div className="setting-row"><span>Аккаунт</span><strong>{user?.email ?? 'не используется'}</strong></div>
      </div>
      {user && <button className="secondary-button" type="button" onClick={onSignOut}>Выйти из Google</button>}
      <DebugPanel trace={trace} />
    </section>
  );
}
