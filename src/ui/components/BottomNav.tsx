import { Icon, type IconName } from './Icon';

export type AppTab = 'chat' | 'together' | 'look' | 'room' | 'settings';

const items: Array<{ id: AppTab; label: string; icon: IconName }> = [
  { id: 'chat', label: 'Чат', icon: 'chat' },
  { id: 'together', label: 'Вместе', icon: 'together' },
  { id: 'look', label: 'Образ', icon: 'look' },
  { id: 'room', label: 'Комната', icon: 'room' },
  { id: 'settings', label: 'Ещё', icon: 'settings' },
];

export function BottomNav({ active, onChange }: { active: AppTab; onChange: (tab: AppTab) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Навигация">
      {items.map((item) => (
        <button key={item.id} className={active === item.id ? 'nav-item active' : 'nav-item'} onClick={() => onChange(item.id)} type="button">
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
