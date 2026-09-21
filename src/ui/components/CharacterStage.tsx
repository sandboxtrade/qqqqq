import { useEffect, useState, type CSSProperties } from 'react';
import { defaultCharacter } from '../../character/default-character';
import type { RuntimeState } from '../../engine/runtime';
import { Icon } from './Icon';
import type { AppTab } from './BottomNav';

const activityLabel: Record<string, string> = {
  sleeping: 'спит',
  waking_up: 'просыпается',
  breakfast: 'завтракает',
  personal_project: 'занята своим делом',
  reading: 'читает',
  music: 'слушает музыку',
  walk: 'гуляет',
  cooking: 'готовит',
  errands: 'по делам',
  cafe_break: 'в кафе',
  relaxing: 'отдыхает',
  chatting: 'с тобой',
  idle: 'свободна',
};

const timeLabel: Record<string, string> = { night: 'ночь', morning: 'утро', day: 'день', evening: 'вечер' };
const relationshipLabel: Record<string, string> = { new: 'знакомство', familiar: 'близко', close: 'очень близко', deep: 'глубокая связь' };

export function CharacterStage({
  runtime,
  busy = false,
  onNavigate,
}: {
  runtime: RuntimeState | null;
  busy?: boolean;
  onNavigate: (tab: AppTab) => void;
}) {
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [blinking, setBlinking] = useState(false);

  const mood = runtime?.emotion.mood ?? 0.5;
  const moodLabel = mood > 0.7 ? 'хорошее настроение' : mood < 0.36 ? 'немного закрыта' : 'спокойная';
  const avatarSrc = `${import.meta.env.BASE_URL}assets/character/avatar-main.jpg`;
  const photoStyle: CSSProperties = { backgroundImage: `url("${avatarSrc}")` };

  useEffect(() => {
    let stopped = false;
    let nextBlink = 0;
    let blinkEnd = 0;
    let secondBlink = 0;
    let secondBlinkEnd = 0;

    const schedule = () => {
      const delay = 2800 + Math.random() * 4300;
      nextBlink = window.setTimeout(() => {
        if (stopped) return;
        setBlinking(true);

        blinkEnd = window.setTimeout(() => {
          if (stopped) return;
          setBlinking(false);

          if (Math.random() < 0.2) {
            secondBlink = window.setTimeout(() => {
              if (stopped) return;
              setBlinking(true);
              secondBlinkEnd = window.setTimeout(() => {
                if (!stopped) setBlinking(false);
                schedule();
              }, 105);
            }, 145);
          } else {
            schedule();
          }
        }, 115);
      }, delay);
    };

    schedule();

    return () => {
      stopped = true;
      window.clearTimeout(nextBlink);
      window.clearTimeout(blinkEnd);
      window.clearTimeout(secondBlink);
      window.clearTimeout(secondBlinkEnd);
    };
  }, []);

  return (
    <section className={`stage live-photo-stage ${busy ? 'is-thinking' : ''}`}>
      <div className="stage-ambient" />
      <div className="stage-grid" />

      <img
        className="character-preload"
        src={avatarSrc}
        alt=""
        aria-hidden="true"
        onLoad={() => setImageState('ready')}
        onError={() => setImageState('error')}
      />

      {imageState === 'ready' && (
        <div className="live-avatar" role="img" aria-label={defaultCharacter.name}>
          <div className="live-avatar-frame">
            <div className="live-photo-layer live-photo-base" style={photoStyle} />
            <div className="live-photo-layer live-photo-hair" style={photoStyle} aria-hidden="true" />
            <div className="live-photo-layer live-photo-hand-face" style={photoStyle} aria-hidden="true" />
            <div className="live-photo-layer live-photo-hand-bed" style={photoStyle} aria-hidden="true" />

            <div className={`live-blink ${blinking ? 'closed' : ''}`} aria-hidden="true">
              <span className="live-eyelid live-eyelid-left" />
              <span className="live-eyelid live-eyelid-right" />
            </div>

            <div className="live-photo-vignette" aria-hidden="true" />
          </div>
        </div>
      )}

      {imageState !== 'ready' && (
        <div className="avatar-placeholder" aria-label="Место для изображения персонажа">
          <div className="avatar-halo" />
          <div className="avatar-silhouette"><span>{defaultCharacter.name.slice(0, 1)}</span></div>
          <small>{imageState === 'error' ? 'Не удалось загрузить фото' : 'Фото загружается…'}</small>
        </div>
      )}

      <div className="stage-topline">
        <div className="presence-pill">
          <span className={runtime?.world.isAwake === false ? 'presence-dot sleeping' : 'presence-dot'} />
          {busy ? 'думает…' : runtime ? activityLabel[runtime.world.currentActivity] ?? runtime.world.currentActivity : 'загрузка'}
        </div>
        <button className="glass-icon-button" type="button" onClick={() => onNavigate('settings')} aria-label="Настройки">
          <Icon name="settings" size={18} />
        </button>
      </div>

      <div className="stage-bottom">
        <div className="character-title">
          <div>
            <h1>{defaultCharacter.name}</h1>
            <p>{moodLabel} · {timeLabel[runtime?.world.timeOfDay ?? ''] ?? 'сейчас'}</p>
          </div>
          <span className="relationship-badge">
            {relationshipLabel[runtime?.relationship.stage ?? 'new'] ?? 'знакомство'}
          </span>
        </div>
        <div className="quick-actions">
          <button type="button" onClick={() => onNavigate('together')}><Icon name="together" size={18} /><span>Вместе</span></button>
          <button type="button" onClick={() => onNavigate('look')}><Icon name="hanger" size={18} /><span>Образ</span></button>
          <button type="button" onClick={() => onNavigate('room')}><Icon name="chair" size={18} /><span>Комната</span></button>
        </div>
      </div>
    </section>
  );
}
