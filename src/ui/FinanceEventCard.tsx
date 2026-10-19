import { decodeEconomyEvent, formatGameMoney, economicSignificance } from "../storage/player-data";

/** Render an actual in-world payment/gift card, not a user-authored "I sent money" text. */
export function FinanceEventCard({ message }: { message: string }) {
  const event = decodeEconomyEvent(message);
  if (!event) return null;
  const isTransfer = event.kind === "transfer";
  const significant = economicSignificance(event.amount);
  return <div className={`game2-finance-event ${isTransfer ? "is-transfer" : "is-gift"}`}>
    <div className="game2-finance-art" aria-hidden="true">
      <div className="game2-finance-halo" />
      <div className="game2-finance-illustration">
        {isTransfer ? <svg viewBox="0 0 160 108" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="16" y="22" width="112" height="69" rx="13" transform="rotate(-11 16 22)" fill="#547a67" stroke="#bdd6c4" strokeWidth="1.5"/>
          <rect x="24" y="15" width="112" height="69" rx="13" transform="rotate(-4 24 15)" fill="#1e5144" stroke="#9acbb7" strokeWidth="1.5"/>
          <rect x="32" y="15" width="115" height="71" rx="12" fill="#244c3f" stroke="#a2d7c0" strokeWidth="2"/>
          <rect x="40" y="23" width="99" height="55" rx="9" stroke="#74bca0" strokeDasharray="4 5"/>
          <circle cx="89" cy="50" r="22" fill="#a4d8bb" opacity=".18"/>
          <text x="89" y="61" fontSize="30" textAnchor="middle" fontWeight="700" fill="#d8f8e6">$</text>
          <circle cx="29" cy="77" r="10" fill="#e8cca0"/><path d="M24 77h10M29 72v10" stroke="#4e634f" strokeWidth="2"/>
        </svg> : <svg viewBox="0 0 160 108" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M41 47h76v48H41z" fill="#9b6575"/><rect x="34" y="41" width="90" height="14" rx="4" fill="#d49aa3"/>
          <path d="M73 42h13v53H73z" fill="#f2c4c7"/><path d="M34 47h90v8H34z" fill="#e3aeb9"/>
          <path d="M80 40C55 24 51 17 56 11c6-8 22-1 24 29Zm0 0c23-23 27-30 19-34-11-5-22 7-19 34Z" stroke="#edc4cc" strokeWidth="7" strokeLinecap="round"/>
          <path d="M52 95h57" stroke="#b67c8c" strokeWidth="2"/>
        </svg>}
      </div>
      <span className="game2-finance-art-label">{isTransfer ? "ПЕРЕВОД ВЫПОЛНЕН" : "ПОДАРОК ОТПРАВЛЕН"}</span>
    </div>
    <div className="game2-finance-details">
      <span className="game2-finance-kind">{isTransfer ? "Денежный перевод" : "Подарок"}</span>
      <strong>{isTransfer ? formatGameMoney(event.amount) : event.label}</strong>
      <small>{isTransfer ? "Зачислено на личный счёт" : `Стоимость ${formatGameMoney(event.amount)}`}</small>
      {(significant === "major" || significant === "life_changing") && <span className="game2-finance-meaning">Значимое событие</span>}
    </div>
  </div>;
}
