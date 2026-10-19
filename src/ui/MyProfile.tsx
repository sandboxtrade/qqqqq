import { useEffect, useState } from "react";
import {formatGameMoney, type PlayerProfile, type VirtualWallet} from "../storage/player-data";
import { Icon } from "./components";
const THEMES = [{ value: "rose", label: "Розовый" }, { value: "midnight", label: "Ночной" }, { value: "ocean", label: "Синий" }, { value: "sage", label: "Зелёный" }] as const;
export function MyProfile({ profile, wallet, loading, saving, onSave, onTopUp }: {
  profile: PlayerProfile | null; wallet: VirtualWallet | null; loading: boolean; saving: boolean;
  onSave: (profile: PlayerProfile) => Promise<void>;
  onTopUp: (amount: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<PlayerProfile | null>(profile);
  const [topUpValue, setTopUpValue] = useState("1000");
  const [adding, setAdding] = useState(false);
  useEffect(() => setDraft(profile), [profile]);
  if (loading || !draft) return <section className="alex-page"><div className="alex-loading">Загружается профиль…</div></section>;
  const edit = (changes: Partial<PlayerProfile>) => setDraft(p => p ? { ...p, ...changes } : p);
  return <section className="alex-page alex-own-profile" aria-label="Мой профиль">
    <div className="alex-page-heading"><span className="alex-eyebrow">МОЙ АККАУНТ</span><h1>Мой профиль</h1><p>Так тебя будут видеть девушки в соцсети, когда появится система знакомств.</p></div>
    <div className={`alex-profile-cover theme-${draft.theme}`}>
      <div className="alex-profile-picture">{draft.avatarUrl ? <img src={draft.avatarUrl} alt="Мой аватар" /> : draft.displayName.charAt(0).toUpperCase()}</div>
      <strong>{draft.displayName}</strong><span>{draft.handle ? `@${draft.handle}` : "Добавь имя пользователя"}</span>
    </div>
    <div className="alex-form-intro"><h2>Редактировать профиль</h2><p>Имя, фотографии и описание формируют твою анкету в социальном мире.</p></div>
    <form className="alex-profile-form" onSubmit={event => { event.preventDefault(); void onSave(draft); }}>
      <label>Имя<input required maxLength={48} value={draft.displayName} onChange={e => edit({displayName:e.target.value})}/></label>
      <label>Имя пользователя<input maxLength={24} value={draft.handle} placeholder="nickname" onChange={e => edit({handle:e.target.value})}/></label>
      <label>О себе<textarea rows={3} maxLength={420} placeholder="Пара слов о себе" value={draft.bio} onChange={e => edit({bio:e.target.value})}/></label>
      <label>Город<input maxLength={64} value={draft.city} onChange={e => edit({city:e.target.value})}/></label>
      <label>Интересы<input maxLength={240} value={draft.interests} placeholder="Кофе, музыка, путешествия…" onChange={e => edit({interests:e.target.value})}/></label>
      <label>Статус<input maxLength={90} value={draft.status} placeholder="Что у тебя нового?" onChange={e => edit({status:e.target.value})}/></label>
      <label>Ссылка на аватар (HTTPS)<input type="url" value={draft.avatarUrl} placeholder="https://…" onChange={e => edit({avatarUrl:e.target.value})}/></label>
      <label>Оформление<select value={draft.theme} onChange={e => edit({theme:e.target.value as PlayerProfile["theme"]})}>{THEMES.map(t => <option value={t.value} key={t.value}>{t.label}</option>)}</select></label>
      <label className="alex-profile-visibility"><input type="checkbox" checked={draft.discoverable} onChange={e => edit({discoverable:e.target.checked})}/><span><strong>Показывать анкету другим персонажам</strong><small>Подготовка к будущим входящим знакомствам. Автоматический подбор и новые сообщения пока не включены.</small></span></label>
      <button className="alex-save-button" type="submit" disabled={saving || !draft.displayName.trim()}>{saving ? "Сохранение…" : "Сохранить изменения"}</button>
    </form>
    <div className="alex-section-title"><h2>Кошелёк</h2><span>Виртуальная валюта</span></div>
    <div className="alex-wallet-card"><Icon name="gift" size={25}/><div><small>Твой баланс</small><strong>{formatGameMoney(wallet?.balance ?? 0)}</strong></div></div>
    <div className="alex-topup-panel">
      <div><strong>Добавить деньги</strong><small>Пополнение внутри игры, без реальной оплаты</small></div>
      <div className="alex-topup-presets">{[500,2000,5000,10000].map(amount => <button type="button" key={amount} onClick={() => setTopUpValue(String(amount))}>{formatGameMoney(amount)}</button>)}</div>
      <form className="alex-topup-action" onSubmit={event => {event.preventDefault();const amount=Number(topUpValue);if(!Number.isSafeInteger(amount)||amount<1||amount>1000000||adding)return;setAdding(true);void onTopUp(amount).finally(()=>setAdding(false));}}>
        <label>Сумма ($)<input aria-label="Сумма пополнения" type="number" min="1" max="1000000" step="1" value={topUpValue} onChange={event=>setTopUpValue(event.target.value)}/></label>
        <button type="submit" disabled={adding||saving||!wallet}>{adding?"Добавляем…":"Пополнить"}</button>
      </form>
      <small>Игровые доллары можно добавлять без ограничений по количеству операций. Это не настоящие деньги.</small>
    </div>
    <p className="alex-profile-note">Средняя зарплата в виртуальном мире — $2,000 в месяц. Переводы и подарки учитываются в истории персонажа, но не гарантируют симпатию.</p>
    <h3 className="alex-ledger-title">Последние операции</h3>
    {wallet?.transactions.length ? wallet.transactions.slice(0, 12).map(entry => <div className="alex-ledger-row" key={entry.id}><span>{entry.kind === "gift" ? "Подарок" : entry.kind === "topup" ? "Пополнение" : "Перевод"}: {entry.label}<small>{new Date(entry.createdAt).toLocaleString("ru-RU")}</small></span><strong className={entry.kind === "topup" ? "credit" : ""}>{entry.kind === "topup" ? "+" : "−"}{formatGameMoney(entry.amount)}</strong></div>) : <p className="alex-profile-note">Операций пока нет.</p>}
  </section>;
}
