import { Icon } from "./Icon";

export function AuthGate({
  busy,
  error,
  onSignIn,
}: {
  busy: boolean;
  error: string | null;
  onSignIn: () => void;
}) {
  return (
    <main className="auth-shell">
      <div className="auth-orb">
        <span>Y</span>
      </div>
      <div className="auth-copy">
        <span className="eyebrow">PRIVATE COMPANION</span>
        <h1>Только ваше пространство</h1>
        <p>
          Войдите через Google, чтобы память, состояние и история
          синхронизировались через Firestore.
        </p>
      </div>
      {error && <div className="error-card">{error}</div>}
      <button
        className="google-button"
        type="button"
        onClick={onSignIn}
        disabled={busy}
      >
        <Icon name="google" size={20} />
        <span>{busy ? "Входим…" : "Войти через Google"}</span>
      </button>
      <small className="auth-note">
        Без входа данные Firebase недоступны. Локальная версия работает только
        когда Firebase-конфиг не задан.
      </small>
    </main>
  );
}
