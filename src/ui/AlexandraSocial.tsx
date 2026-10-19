import type { PlayerProfile } from "../storage/player-data";
import { Icon } from "./components";

const posts = [
  { id: 1, date: "Заметка", text: "Учёба после рабочего дня — это когда открываешь конспект и понимаешь, что кофе было мало.", category: "УЧЁБА" },
  { id: 2, date: "Заметка", text: "В офисе снова переставляли встречи. Самое сложное — выглядеть невозмутимой, когда всё меняется в пятнадцатый раз.", category: "РАБОТА" },
];
export function AlexandraSocial({ onMessage, onMyProfile, playerProfile }: {
  onMessage: () => void; onMyProfile: () => void; playerProfile: PlayerProfile | null;
}) {
  return <section className="alex-page alex-social" aria-label="Соцсеть">
    <div className="alex-page-heading"><span className="alex-eyebrow">ОБЩАЯ ЛЕНТА</span><h1>Соцсеть</h1><p>Публикации, страницы персонажей и твоя собственная анкета.</p></div>
    <div className="alex-social-profile"><div className="alex-social-avatar">{playerProfile?.displayName.charAt(0) ?? "Я"}</div>
      <div><strong>{playerProfile?.displayName ?? "Мой профиль"}</strong><span>{playerProfile?.handle ? `@${playerProfile.handle}` : "Создай свою анкету"}</span>
      <small>{playerProfile?.discoverable ? "Открыт для знакомств" : "Анкета скрыта от поиска"}</small></div>
      <button type="button" onClick={onMyProfile}>Изменить</button></div>
    <div className="alex-section-title"><h2>Лента</h2><span>{posts.length} публикации</span></div>
    <div className="alex-social-profile"><div className="alex-social-avatar">А</div><div><strong>Александра</strong><span>@alexandra · 25 лет</span><small>Секретарь в офисе • учусь</small></div><button type="button" onClick={onMessage}>Написать</button></div>
    {posts.map(post => <article className="alex-post" key={post.id}><div className="alex-post-header"><span className="alex-post-icon">А</span>
      <div><strong>Александра</strong><span>{post.date} · {post.category}</span></div></div><p>{post.text}</p></article>)}
    <div className="alex-social-empty"><Icon name="look" size={26}/><strong>Фотографии и новые публикации — следующий этап</strong>
      <span>Автоматическая генерация фотографий при открытии приложения отключена. Фото в переписке через WaveSpeed LoRA сохранены.</span></div>
  </section>;
}
