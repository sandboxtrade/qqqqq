import { useState } from 'react';
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

export function CharacterStage({ runtime, onNavigate }: { runtime: RuntimeState | null; onNavigate: (tab: AppTab) => void }) {
  const [imageReady, setImageReady] = useState(true);
  const mood = runtime?.emotion.mood ?? 0.5;
  const moodLabel = mood > 0.7 ? 'хорошее настроение' : mood < 0.36 ? 'немного закрыта' : 'спокойная';
  const avatarSrc = `${import.meta.env.BASE_URL}assets/character/avatar-main.png`;

  return (
    <section className="stage">
      <div className="stage-ambient" />
      <div className="stage-grid" />
      {imageReady && (
        <img
          className="character-image"
          src={avatarSrc}
          alt={defaultCharacter.name}
          onError={() => setImageReady(false)}
        />
      )}
      {!imageReady && (
        <div className="avatar-placeholder" aria-label="Место для изображения персонажа">
          <div className="avatar-halo" />
          <div className="avatar-silhouette"><span>{defaultCharacter.name.slice(0, 1)}</span></div>
          <small>PNG персонажа появится здесь</small>
        </div>
      )}

      <div className="stage-topline">
        <div className="presence-pill"><span className={runtime?.world.isAwake === false ? 'presence-dot sleeping' : 'presence-dot'} />{runtime ? activityLabel[runtime.world.currentActivity] ?? runtime.world.currentActivity : 'загрузка'}</div>
        <button className="glass-icon-button" type="button" onClick={() => onNavigate('settings')} aria-label="Настройки"><Icon name="settings" size={18} /></button>
      </div>

      <div className="stage-bottom">
        <div className="character-title">
          <div><h1>{defaultCharacter.name}</h1><p>{moodLabel} · {timeLabel[runtime?.world.timeOfDay ?? ''] ?? 'сейчас'}</p></div>
          <span className="relationship-badge">{relationshipLabel[runtime?.relationship.stage ?? 'new'] ?? 'знакомство'}</span>
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
