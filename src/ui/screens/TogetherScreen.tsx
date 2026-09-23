import { Icon, type IconName } from "../components/Icon";

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
