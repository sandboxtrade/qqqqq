/**
 * Consolidated module. Kept intentionally domain-sized to reduce source fragmentation
 * without changing runtime behavior.
 */
import { Icon, type IconName } from "./components";

// ---- CustomizeScreen.tsx ----
export function CustomizeScreen({ mode }: { mode: "look" | "room" }) {
  const isLook = mode === "look";
  return (
    <section className="panel-screen">
      <div className="section-heading">
        <span className="eyebrow">{isLook ? "CHARACTER LOOK" : "SCENE"}</span>
        <h2>{isLook ? "Образ и поза" : "Комната"}</h2>
        <p>
          {isLook
            ? "Одежда, поза и аксессуары будут переключаться через asset manifest."
            : "Фон комнаты будет независим от персонажа, чтобы сцены можно было комбинировать."}
        </p>
      </div>
      <div className="asset-preview-card">
        <span className="asset-preview-icon">
          <Icon name={isLook ? "hanger" : "room"} size={30} />
        </span>
        <strong>{isLook ? "Ждём первый пакет PNG" : "Ждём фоны комнат"}</strong>
        <small>
          {isLook ? "public/assets/character/" : "public/assets/rooms/"}
        </small>
      </div>
      <div className="option-row">
        {(isLook
          ? ["Домашний", "Повседневный", "Выходной"]
          : ["Спальня", "Гостиная", "Кухня"]
        ).map((item, index) => (
          <button
            type="button"
            className={index === 0 ? "option-chip selected" : "option-chip"}
            disabled
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

// ---- TogetherScreen.tsx ----
const actions: Array<{ icon: IconName; title: string; text: string }> = [
  {
    icon: "movie",
    title: "Посмотреть вместе",
    text: "Совместная сессия с реакциями и общей историей.",
  },
  {
    icon: "walk",
    title: "Куда-нибудь сходить",
    text: "Кафе, прогулка, ресторан и другие совместные места.",
  },
  {
    icon: "gift",
    title: "Подарить что-нибудь",
    text: "Подарки будут попадать в память и её инвентарь.",
  },
];

export function TogetherScreen() {
  return (
    <section className="panel-screen">
      <div className="section-heading">
        <span className="eyebrow">SHARED LIFE</span>
        <h2>Провести время вместе</h2>
        <p>
          Каркас уже предусмотрен. Сами активности подключим следующим этапом
          движка.
        </p>
      </div>
      <div className="feature-grid">
        {actions.map((action) => (
          <button
            className="feature-card"
            type="button"
            key={action.title}
            disabled
          >
            <span className="feature-icon">
              <Icon name={action.icon} size={22} />
            </span>
            <span>
              <strong>{action.title}</strong>
              <small>{action.text}</small>
            </span>
            <em>скоро</em>
          </button>
        ))}
      </div>
    </section>
  );
}
