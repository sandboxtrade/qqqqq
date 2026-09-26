import type { SocialCharacterProfile } from "../character/character-registry";

function Avatar({ profile, size = "normal" }: { profile: SocialCharacterProfile; size?: "normal" | "large" }) {
  return (
    <div className={`social-avatar social-avatar-${profile.avatarTone} ${size === "large" ? "large" : ""}`}>
      {profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.core.name} /> : <span>{profile.core.name.slice(0, 1)}</span>}
    </div>
  );
}

export function InboxScreen({
  characters,
  activeCharacterId,
  onOpenChat,
  onOpenProfile,
}: {
  characters: readonly SocialCharacterProfile[];
  activeCharacterId: string;
  onOpenChat: (characterId: string) => void;
  onOpenProfile: (characterId: string) => void;
}) {
  return (
    <section className="social-screen">
      <header className="social-page-header">
        <div>
          <span className="social-kicker">MESSAGES</span>
          <h1>Сообщения</h1>
        </div>
      </header>
      <div className="conversation-list">
        {characters.map((profile) => (
          <button
            key={profile.id}
            className={`conversation-card ${profile.id === activeCharacterId ? "active" : ""}`}
            type="button"
            onClick={() => onOpenChat(profile.id)}
          >
            <Avatar profile={profile} />
            <span className="conversation-copy">
              <span className="conversation-title-row">
                <strong>{profile.core.name}</strong>
                <small>{profile.id === activeCharacterId ? "активный чат" : ""}</small>
              </span>
              <span>{profile.headline}</span>
            </span>
            <span
              className="profile-link"
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onOpenProfile(profile.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenProfile(profile.id);
                }
              }}
            >
              ···
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function PeopleScreen({
  characters,
  onOpenProfile,
  onOpenChat,
}: {
  characters: readonly SocialCharacterProfile[];
  onOpenProfile: (characterId: string) => void;
  onOpenChat: (characterId: string) => void;
}) {
  return (
    <section className="social-screen">
      <header className="social-page-header">
        <div>
          <span className="social-kicker">PEOPLE</span>
          <h1>Люди</h1>
        </div>
      </header>
      <div className="people-grid">
        {characters.map((profile) => (
          <article className="person-card" key={profile.id}>
            <button className="person-main" type="button" onClick={() => onOpenProfile(profile.id)}>
              <Avatar profile={profile} size="large" />
              <strong>{profile.core.name}</strong>
              <span>{profile.handle}</span>
              <p>{profile.headline}</p>
            </button>
            <button className="person-message-button" type="button" onClick={() => onOpenChat(profile.id)}>
              Написать
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CharacterProfileScreen({
  profile,
  onBack,
  onMessage,
}: {
  profile: SocialCharacterProfile;
  onBack: () => void;
  onMessage: () => void;
}) {
  return (
    <section className="social-screen character-profile-screen">
      <header className="social-page-header profile-header-bar">
        <button className="social-back" type="button" onClick={onBack}>‹</button>
        <strong>Профиль</strong>
        <span />
      </header>
      <div className="character-profile-card">
        <Avatar profile={profile} size="large" />
        <h1>{profile.core.name}</h1>
        <span className="profile-handle">{profile.handle}</span>
        <p className="profile-headline">{profile.headline}</p>
        <p className="profile-bio">{profile.bio}</p>
        <div className="profile-meta">
          <span>{profile.core.age} лет</span>
          <span>отдельная память</span>
          <span>отдельные отношения</span>
        </div>
        <button className="profile-message-button" type="button" onClick={onMessage}>
          Открыть диалог
        </button>
      </div>
    </section>
  );
}
