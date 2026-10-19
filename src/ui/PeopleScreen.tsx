import { useState } from "react";
import { characterProfiles } from "../character/character-registry";
import { GIFT_CATALOG, TRANSFER_AMOUNTS, type VirtualTransactionKind, type VirtualWallet } from "../storage/player-data";
import { Icon } from "./components";

type Spend = { characterId: string; kind: VirtualTransactionKind; label: string; amount: number };
export function PeopleScreen({ wallet, walletBusy, ready, onChat, onSpend }: {
  wallet: VirtualWallet | null; walletBusy: boolean; ready: boolean;
  onChat: (characterId: string) => void;
  onSpend: (spend: Spend) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<"gifts" | "transfer" | null>(null);
  const [pending, setPending] = useState<Spend | null>(null);
  const balance = wallet?.balance ?? 0;
  const choose = (spend: Spend) => { setPending(spend); };
  const confirm = async () => {
    if (!pending) return;
    if (await onSpend(pending)) { setPending(null); setPanel(null); }
  };
  return <section className="alex-page" aria-label="Люди">
    <div className="alex-page-heading"><span className="alex-eyebrow">ЗНАКОМСТВА</span><h1>Люди</h1>
      <p>Персонажи живут своей жизнью. Общение и отношения развиваются отдельно с каждым.</p></div>
    <div className="alex-wallet-strip"><span><Icon name="gift" size={19}/> Виртуальный кошелёк</span><strong>{wallet ? balance.toLocaleString("ru-RU") : "…"} монет</strong></div>
    {characterProfiles.map(person => <article className="alex-person-card" key={person.id}>
      <div className="alex-person-head"><div className="alex-social-avatar">{person.core.name.charAt(0)}</div>
        <div><strong>{person.core.name}, {person.core.age}</strong><span>@{person.handle} · {person.occupation}</span><small>{person.bio}</small></div></div>
      <div className="alex-person-actions">
        <button type="button" className="primary" onClick={() => onChat(person.id)}>Написать</button>
        <button type="button" onClick={() => { setSelected(person.id); setPanel(panel === "gifts" && selected === person.id ? null : "gifts"); setPending(null); }}>Подарок</button>
        <button type="button" onClick={() => { setSelected(person.id); setPanel(panel === "transfer" && selected === person.id ? null : "transfer"); setPending(null); }}>Перевод</button>
      </div>
      {selected === person.id && panel && <div className="alex-spending-panel">
        <h3>{panel === "gifts" ? "Подарки" : "Отправить виртуальные монеты"}</h3>
        <p>Всё внутри игры. Деньги и подарки не гарантируют симпатию и не отменяют личные границы.</p>
        <div className="alex-spending-items">
          {panel === "gifts" ? GIFT_CATALOG.map(item => <button type="button" key={item.id} onClick={() => choose({characterId:person.id,kind:"gift",label:item.label,amount:item.price})}>{item.label}<small>{item.price.toLocaleString("ru-RU")} монет</small></button>)
          : TRANSFER_AMOUNTS.map(amount => <button key={amount} type="button" onClick={() => choose({characterId:person.id,kind:"transfer",label:"Виртуальный перевод",amount})}>{amount.toLocaleString("ru-RU")} монет</button>)}
        </div>
        {pending && <div className="alex-confirm-spend"><span>Списать {pending.amount.toLocaleString("ru-RU")} монет за «{pending.label}»?</span>
          <div><button type="button" onClick={() => setPending(null)}>Отмена</button><button type="button" disabled={walletBusy || !ready || pending.amount > balance} onClick={() => void confirm()}>Подтвердить</button></div>
        </div>}
      </div>}
    </article>)}
    <div className="alex-social-empty"><Icon name="together" size={25}/><strong>Другие девушки появятся позже</strong><span>Реестр и сохранения поддерживают отдельные истории и отношения для будущих персонажей. Фиктивные анкеты пока не добавлены.</span></div>
  </section>;
}
