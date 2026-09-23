import { Icon } from "../components/Icon";

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
