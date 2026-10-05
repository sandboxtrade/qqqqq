import { useEffect, useState } from "react";
import type { SocialCharacterProfile } from "../character/character-registry";
import { Icon } from "./components";

function mediaStyle(position?: string, fit?: "cover" | "contain") {
  return {
    objectPosition: position ?? "center 20%",
    objectFit: fit ?? "cover",
  } as const;
}

function PhotoPlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`profile-photo-placeholder ${compact ? "compact" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M8.1 8.2a3.9 3.9 0 1 1 7.8 0 3.9 3.9 0 0 1-7.8 0Z" />
        <path d="M4.2 21c.55-4.45 3.15-6.7 7.8-6.7s7.25 2.25 7.8 6.7" />
      </svg>
    </span>
  );
}

export function ProfileAvatar({
  profile,
  size = "normal",
}: {
  profile: SocialCharacterProfile;
  size?: "mini" | "normal" | "large";
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [profile.avatarUrl]);
  const hasPhoto = Boolean(profile.avatarUrl) && !failed;
  const imageStyle = size === "large"
    ? mediaStyle(profile.cardObjectPosition ?? profile.avatarObjectPosition, profile.cardObjectFit ?? profile.avatarObjectFit)
    : mediaStyle(profile.avatarObjectPosition, profile.avatarObjectFit);

  return (
    <span className={`social-avatar social-avatar-${profile.avatarTone} avatar-${size} ${hasPhoto ? "has-photo" : "no-photo"}`}>
      {hasPhoto ? (
        <img src={profile.avatarUrl} alt={profile.core.name} style={imageStyle} onError={() => setFailed(true)} />
      ) : (
        <PhotoPlaceholder compact={size === "mini"} />
      )}
    </span>
  );
}

function ProfileHero({ profile }: { profile: SocialCharacterProfile }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [profile.avatarUrl]);
  const hasPhoto = Boolean(profile.avatarUrl) && !failed;
  const imageStyle = mediaStyle(profile.heroObjectPosition ?? profile.avatarObjectPosition, profile.heroObjectFit ?? profile.avatarObjectFit);
  return (
    <div className={`dating-profile-hero hero-${profile.avatarTone} ${hasPhoto ? "has-photo" : "no-photo"}`}>
      {hasPhoto ? (
        <img src={profile.avatarUrl} alt={profile.core.name} style={imageStyle} onError={() => setFailed(true)} />
      ) : (
        <div className="dating-profile-hero-placeholder">
          <PhotoPlaceholder />
          <span>Фото профиля появится позже</span>
        </div>
      )}
      <div className="dating-profile-hero-shade" />
      <div className="dating-profile-hero-copy">
        <div className="profile-name-line">
          <h1>{profile.core.name}</h1>
          <strong>{profile.core.age}</strong>
        </div>
        <span>{profile.locationLabel} · {profile.occupation}</span>
      </div>
    </div>
  );
}

function GalleryCard({ item, tone }: { item: SocialCharacterProfile["gallery"][number]; tone: SocialCharacterProfile["avatarTone"] }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.imageUrl]);
  const hasPhoto = Boolean(item.imageUrl) && !failed;
  const imageStyle = mediaStyle(item.objectPosition, item.objectFit);
  return (
    <article className={`profile-gallery-card gallery-${tone} ${hasPhoto ? "has-photo" : "no-photo"}`}>
      <div className="profile-gallery-media">
        {hasPhoto ? (
          <img src={item.imageUrl} alt={item.caption} loading="lazy" style={imageStyle} onError={() => setFailed(true)} />
        ) : (
          <div className="profile-gallery-placeholder">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h2l1.1-1.5h4.8L15.5 5h2A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
            <span>добавим фото</span>
          </div>
        )}
      </div>
      <div className="profile-gallery-caption">
        <strong>{item.caption}</strong>
        {item.note ? <span>{item.note}</span> : null}
      </div>
    </article>
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
    <section className="social-screen social-screen-v2">
      <header className="social-page-header social-page-header-v2">
        <div>
          <span className="social-kicker">MESSAGES</span>
          <h1>Сообщения</h1>
        </div>
        <span className="page-counter">{characters.length}</span>
      </header>

      <div className="conversation-list conversation-list-v2">
        {characters.map((profile) => (
          <article key={profile.id} className={`conversation-row ${profile.id === activeCharacterId ? "active" : ""}`}>
            <button className="conversation-open" type="button" onClick={() => onOpenChat(profile.id)}>
              <ProfileAvatar profile={profile} />
              <span className="conversation-copy-v2">
                <span className="conversation-name-line">
                  <strong>{profile.core.name}</strong>
                  <small>{profile.core.age}</small>
                </span>
                <span className="conversation-preview">{profile.datingLine}</span>
              </span>
            </button>
            <button className="conversation-more" type="button" onClick={() => onOpenProfile(profile.id)} aria-label={`Открыть профиль ${profile.core.name}`}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="8" r="3.2" />
                <path d="M5.5 20c.55-4.2 2.7-6.2 6.5-6.2s5.95 2 6.5 6.2" />
              </svg>
            </button>
          </article>
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
    <section className="social-screen social-screen-v2">
      <header className="social-page-header social-page-header-v2 people-heading">
        <div>
          <span className="social-kicker">DISCOVER</span>
          <h1>Люди</h1>
          <p>У каждой — свой профиль, характер и отдельная история общения.</p>
        </div>
      </header>

      <div className="people-grid people-grid-v2">
        {characters.map((profile) => (
          <article className={`person-card-v2 tone-card-${profile.avatarTone}`} key={profile.id}>
            <button className="person-photo-button" type="button" onClick={() => onOpenProfile(profile.id)}>
              <ProfileAvatar profile={profile} size="large" />
              <span className="person-photo-overlay" />
              <span className="person-card-copy">
                <span className="person-name-line">
                  <strong>{profile.core.name}</strong>
                  <em>{profile.core.age}</em>
                </span>
                <small>{profile.locationLabel}</small>
              </span>
            </button>
            <div className="person-card-bottom">
              <p>{profile.datingLine}</p>
              <button type="button" onClick={() => onOpenChat(profile.id)}>Написать</button>
            </div>
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
  onSettings,
}: {
  profile: SocialCharacterProfile;
  onBack: () => void;
  onMessage: () => void;
  onSettings: () => void;
}) {
  return (
    <section className="social-screen character-profile-screen character-profile-v2">
      <header className="profile-floating-header">
        <button className="social-back social-back-v2" type="button" onClick={onBack} aria-label="Назад">‹</button>
        <span>Профиль</span>
        <button className="profile-settings-button" type="button" onClick={onSettings} aria-label={`Настройки ${profile.core.name}`}>
          <Icon name="settings" size={18} />
        </button>
      </header>

      <ProfileHero profile={profile} />

      <div className="profile-content-v2">
        <section className="profile-status-card">
          <span>Я здесь потому что</span>
          <p>{profile.datingLine}</p>
        </section>

        <section className="profile-section-v2">
          <h2>О себе</h2>
          <p>{profile.bio}</p>
          <div className="profile-facts-grid">
            <div><span>Город</span><strong>{profile.locationLabel}</strong></div>
            <div><span>Занятие</span><strong>{profile.occupation}</strong></div>
            <div className="wide"><span>Ищу</span><strong>{profile.lookingFor}</strong></div>
            <div className="wide"><span>Образ</span><strong>{profile.appearanceLabel}</strong></div>
          </div>
        </section>

        <section className="profile-section-v2">
          <h2>Интересы</h2>
          <div className="profile-interest-list">
            {profile.interests.map((interest) => <span key={interest}>{interest}</span>)}
          </div>
        </section>

        <section className="profile-section-v2 profile-gallery-section">
          <div className="profile-section-heading-row">
            <h2>Фото</h2>
            <span>{profile.gallery.length}</span>
          </div>
          <div className="profile-gallery-grid">
            {profile.gallery.map((item) => <GalleryCard key={item.id} item={item} tone={profile.avatarTone} />)}
          </div>
        </section>
      </div>

      <div className="profile-action-dock">
        <button type="button" onClick={onMessage}>Написать {profile.core.name}</button>
      </div>
    </section>
  );
}
