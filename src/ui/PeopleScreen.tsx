import { publicAssetUrl } from "../utils/public-asset-url";
import { useState } from "react";
import { characterProfiles } from "../character/character-registry";
import { GIFT_CATALOG, TRANSFER_AMOUNTS, formatGameMoney, type VirtualTransactionKind, type VirtualWallet } from "../storage/player-data";
import { Icon } from "./components";

type Spend = { characterId: string; kind: VirtualTransactionKind; label: string; amount: number };
export function PeopleScreen({ wallet, walletBusy, ready, onChat, onSettings, onSpend }: {
  wallet: VirtualWallet | null; walletBusy: boolean; ready: boolean;
  onChat: (characterId: string) => void;
  onSettings: (characterId: string) => void;
  onSpend: (spend: Spend) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<"gifts" | "transfer" | null>(null);
  const [pending, setPending] = useState<Spend | null>(null);
  const balance = wallet?.balance ?? 0;
  const [customAmount, setCustomAmount] = useState("2000");
  const choose = (spend: Spend) => { setPending(spend); };
  const confirm = async () => {
    if (!pending) return;
    if (await onSpend(pending)) { setPending(null); setPanel(null); }
  };
  return <section className="alex-page" aria-label="Люди">
    <div className="alex-page-heading"><span className="alex-eyebrow">ЗНАКОМСТВА</span><h1>Люди</h1>
      <p>Персонажи живут своей жизнью. Общение и отношения развиваются отдельно с каждым.</p></div>
    <div className="alex-wallet-strip"><span><Icon name="gift" size={19}/> Виртуальный кошелёк</span><strong>{wallet ? formatGameMoney(balance) : "…"}</strong></div>
    {characterProfiles.map(person => <article className="alex-person-card" key={person.id}>
      <div className="alex-person-head"><div className="alex-social-avatar">{person.avatarUrl ? <img loading="lazy" src={publicAssetUrl(person.avatarUrl)} alt="" referrerPolicy="no-referrer" /> : person.core.name.charAt(0)}</div>
        <div><strong>{person.core.name}, {person.core.age}</strong><span>@{person.handle} · {person.occupation}</span><small>{person.bio}</small></div></div>
      <div className="alex-person-actions">
        <button type="button" className="primary" onClick={() => onChat(person.id)}><Icon name="chat" size={17}/>Написать</button>
        <button type="button" onClick={() => { setSelected(person.id); setPanel(panel === "gifts" && selected === person.id ? null : "gifts"); setPending(null); }}>Подарок</button>
        <button type="button" onClick={() => { setSelected(person.id); setPanel(panel === "transfer" && selected === person.id ? null : "transfer"); setPending(null); }}>Перевод</button>
      </div>
      <div className="alex-companion-account"><span>Личный счёт {person.core.name}</span><strong>{formatGameMoney(wallet?.companions?.[person.id]?.balance ?? 0)}</strong>
        <small>Деньги поступают на её собственный счёт. В дальнейшем она может тратить их на свои дела.</small>
        {wallet?.companions?.[person.id]?.expenses?.slice(0,2).map(expense=><small key={expense.id}>{expense.label} · −{formatGameMoney(expense.amount)}</small>)}
      </div>
      <button type="button" className="alex-person-settings" onClick={() => onSettings(person.id)} aria-label={`Настройки ${person.core.name}`}>
        Настройки {person.core.name} · личность, память, фотографии
      </button>
      {selected === person.id && panel && <div className="alex-spending-panel">
        <h3>{panel === "gifts" ? "Подарки" : "Отправить деньги"}</h3>
        <p>Всё внутри игры. Деньги и подарки не гарантируют симпатию и не отменяют личные границы.</p>
        <div className="alex-spending-items">
          {panel === "gifts" ? GIFT_CATALOG.map(item => <button type="button" key={item.id} onClick={() => choose({characterId:person.id,kind:"gift",label:item.label,amount:item.price})}>{item.label}<small>{formatGameMoney(item.price)}</small></button>)
          : <>{TRANSFER_AMOUNTS.map(amount => <button key={amount} type="button" onClick={() => choose({characterId:person.id,kind:"transfer",label:"Денежный перевод",amount})}>{formatGameMoney(amount)}</button>)}
            <div className="alex-custom-transfer"><label>Своя сумма ($)<input type="number" min="1" max="50000" step="1" value={customAmount} onChange={event=>setCustomAmount(event.target.value)}/></label>
              <button type="button" onClick={()=>{const amount=Number(customAmount);if(Number.isSafeInteger(amount)&&amount>0&&amount<=50000)choose({characterId:person.id,kind:"transfer",label:"Денежный перевод",amount});}}>Выбрать</button></div>
          </>}
        </div>
        {pending && <div className="alex-confirm-spend"><span>Списать {formatGameMoney(pending.amount)} за «{pending.label}»?</span>
          <div><button type="button" onClick={() => setPending(null)}>Отмена</button><button type="button" disabled={walletBusy || !ready || pending.amount > balance} onClick={() => void confirm()}>Подтвердить</button></div>
        </div>}
      </div>}
    </article>)}
    <div className="alex-social-empty"><Icon name="together" size={25}/><strong>Другие девушки появятся позже</strong><span>Реестр и сохранения поддерживают отдельные истории и отношения для будущих персонажей. Фиктивные анкеты пока не добавлены.</span></div>
  </section>;
}
