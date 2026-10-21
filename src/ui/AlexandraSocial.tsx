import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerProfile } from "../storage/player-data";
import { alexandraProfile, anastasiaProfile } from "../character/character-registry";
import {
  ALEXANDRA_SOCIAL_POSTS, ANASTASIA_SOCIAL_POSTS, cacheSocialState, createSocialComment, createSocialPost,
  emptySocialState, fetchSocialState, readCachedSocialState, toggleSocialId, uploadSocialState,
  type SocialPost, type SocialState,
} from "../storage/social-feed";

type Tab = "feed" | "following" | "saved" | "mine";
type View = "timeline" | "alexandra" | "anastasia" | "player" | "notifications";
const ago = (timestamp: number) => {
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return "сейчас";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} мин`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} ч`;
  return new Date(timestamp).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};
const iconPath: Record<string, string> = {
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  comment: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.7-5A8.5 8.5 0 1 1 21 11.5Z",
  bookmark: "M6 3h12v18l-6-4-6 4V3Z",
  search: "M20 20l-4.2-4.2M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z",
  plus: "M12 5v14M5 12h14", bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4Z", close: "M5 5l14 14M19 5 5 19",
  arrow: "M19 12H5M12 5l-7 7 7 7", trash: "M4 7h16M10 11v7M14 11v7M6 7l1 14h10l1-14M9 7V4h6v3",
};
function Glyph({ name, size = 20, filled = false }: { name: string; size?: number; filled?: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPath[name] || iconPath.heart}/></svg>;
}
function Avatar({ name, imageUrl, size = "medium" }: { name: string; imageUrl?: string; size?: "small"|"medium"|"large" }) {
  return <span className={`g2-social-avatar g2-avatar-${size}`}>
    {imageUrl ? <img loading="lazy" src={imageUrl} alt="" referrerPolicy="no-referrer" /> : name.charAt(0).toUpperCase()}
  </span>;
}
export function AlexandraSocial({ onMessage, onMyProfile, playerProfile, uid }: {
  onMessage: (characterId: string) => void; onMyProfile: () => void; playerProfile: PlayerProfile | null; uid: string | null;
}) {
  const [social, setSocial] = useState<SocialState>(() => readCachedSocialState(uid));
  const [tab, setTab] = useState<Tab>("feed");
  const [view, setView] = useState<View>("timeline");
  const [query, setQuery] = useState("");
  const [composer, setComposer] = useState(false);
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState("");
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [syncState, setSyncState] = useState<"ready" | "saving" | "offline">("ready");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(social);
  const changeNumber = useRef(0);
  const persistedNumber = useRef(0);
  const flushing = useRef(false);
  const [flushRequest, setFlushRequest] = useState(0);

  useEffect(() => {
    const cache = readCachedSocialState(uid);
    latest.current = cache; setSocial(cache); setError(null); setSyncState("ready");
    changeNumber.current = 0; persistedNumber.current = 0;
    let active = true;
    // One initial read, no live snapshot listener or repeated background polling.
    void fetchSocialState(uid).then(remote => {
      if (!active || changeNumber.current !== 0) return;
      if (remote.updatedAt >= latest.current.updatedAt) {
        latest.current = remote; cacheSocialState(uid, remote); setSocial(remote);
      } else if (latest.current.updatedAt > 0) {
        // Restore cached work from a previous offline session.
        changeNumber.current += 1; setFlushRequest(v => v + 1);
      }
    }).catch(() => { if (active) { setSyncState("offline"); setError("Облачная лента временно недоступна. Твои действия сохраняются на устройстве."); } });
    return () => { active = false; };
  }, [uid]);

  // Batch rapid actions; never launch two writes for the same social document.
  useEffect(() => {
    if (!flushRequest) return;
    const timer = window.setTimeout(() => {
      if (flushing.current) return; // In-flight write will schedule the next revision.
      flushing.current = true;
      const revision = changeNumber.current;
      void uploadSocialState(uid, latest.current)
        .then(() => {
          persistedNumber.current = Math.max(persistedNumber.current, revision);
          setSyncState(changeNumber.current === revision ? "ready" : "saving");
          if (changeNumber.current === revision) setError(null);
        })
        .catch(() => {
          setSyncState("offline");
          setError("Не удалось синхронизировать ленту. Данные остались на устройстве.");
        })
        .finally(() => {
          flushing.current = false;
          if (changeNumber.current > revision) setFlushRequest(v => v + 1);
        });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [uid, flushRequest]);

  const change = (fn: (previous: SocialState) => SocialState) => {
    const next = { ...fn(latest.current), version: 1 as const, updatedAt: Date.now() };
    latest.current = next; cacheSocialState(uid, next); setSocial(next);
    changeNumber.current += 1; setSyncState("saving"); setFlushRequest(v => v + 1);
  };
  const ownName = playerProfile?.displayName || "Игрок";
  const ownHandle = playerProfile?.handle ? `@${playerProfile.handle}` : "@мой_профиль";
  const allPosts = useMemo(() => [...social.ownPosts, ...ALEXANDRA_SOCIAL_POSTS, ...ANASTASIA_SOCIAL_POSTS].sort((a,b) => b.createdAt-a.createdAt), [social.ownPosts]);
  const filteredPosts = allPosts.filter(post => {
    if (tab === "following" && !social.followingIds.includes(post.authorId)) return false;
    if (tab === "saved" && !social.bookmarkedPostIds.includes(post.id)) return false;
    if (tab === "mine" && post.authorId !== "player") return false;
    if (view === "alexandra" && post.authorId !== "alexandra_v1") return false;
    if (view === "anastasia" && post.authorId !== "anastasia_v1") return false;
    if (view === "player" && post.authorId !== "player") return false;
    const author = post.authorId === "player" ? ownName : post.authorId === "anastasia_v1" ? "Анастасия" : "Александра";
    return (post.text + " " + author).toLowerCase().includes(query.toLowerCase().trim());
  });
  const viewedProfile = view === "anastasia" ? anastasiaProfile : alexandraProfile;
  const viewedFollowing = social.followingIds.includes(viewedProfile.id);
  const viewedPostCount = view === "anastasia" ? ANASTASIA_SOCIAL_POSTS.length : ALEXANDRA_SOCIAL_POSTS.length;
  const publish = () => {
    try { const post = createSocialPost(postText, postImage); change(state => ({...state, ownPosts:[post,...state.ownPosts].slice(0,80)}));
      setComposer(false); setPostText(""); setPostImage(""); setTab("feed"); setView("timeline"); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось создать публикацию."); }
  };
  const sendComment = (postId: string) => {
    try { const comment = createSocialComment(postId, commentInput);
      change(state => ({...state, comments:[...state.comments,comment].slice(-250)})); setCommentInput(""); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось оставить комментарий."); }
  };
  const openProfile = (authorId: "player" | "alexandra_v1" | "anastasia_v1") => {
    setView(authorId === "player" ? "player" : authorId === "anastasia_v1" ? "anastasia" : "alexandra"); setTab("feed"); setQuery(""); setExpandedComments(null);
  };
  const displayPost = (post: SocialPost) => {
    const mine = post.authorId === "player";
    const liked = social.likedPostIds.includes(post.id);
    const saved = social.bookmarkedPostIds.includes(post.id);
    const comments = social.comments.filter(comment => comment.postId === post.id);
    const authorName = mine ? ownName : post.authorId === "anastasia_v1" ? "Анастасия" : "Александра";
    return <article className="g2-social-post" key={post.id}>
      <header className="g2-post-top">
        <button type="button" className="g2-post-author" onClick={() => openProfile(post.authorId)}>
          <Avatar name={authorName} imageUrl={mine ? playerProfile?.avatarUrl : post.authorId === "anastasia_v1" ? anastasiaProfile.avatarUrl : alexandraProfile.avatarUrl} size="small" />
          <span><strong>{authorName}</strong><small>{mine ? ownHandle : post.authorId === "anastasia_v1" ? "@anastasia" : "@alexandra"} · {ago(post.createdAt)}</small></span>
        </button>
        {mine && <button type="button" className="g2-post-options" aria-label="Удалить мою публикацию" title="Удалить публикацию" onClick={() => {
          if (!window.confirm("Удалить эту публикацию?")) return;
          change(s => ({ ...s, ownPosts:s.ownPosts.filter(p=>p.id!==post.id), comments:s.comments.filter(c=>c.postId!==post.id) }));
        }}><Glyph name="trash" size={18}/></button>}
      </header>
      {post.text && <p className="g2-post-copy">{post.text}</p>}
      {post.imageUrl && <img className="g2-post-image" loading="lazy" src={post.imageUrl} alt="Фотография из публикации" referrerPolicy="no-referrer" />}
      <div className="g2-post-actions">
        <button type="button" className={liked ? "selected" : ""} aria-label={liked ? "Убрать отметку Нравится" : "Нравится"} aria-pressed={liked} onClick={()=>change(s=>({...s,likedPostIds:toggleSocialId(s.likedPostIds,post.id)}))}><Glyph name="heart" size={21} filled={liked}/><span>{liked ? "Нравится" : "Нравится"}</span></button>
        <button type="button" onClick={()=>{setExpandedComments(v=>v===post.id?null:post.id);setCommentInput("");}} aria-expanded={expandedComments===post.id}><Glyph name="comment" size={20}/><span>{comments.length ? comments.length : "Комментировать"}</span></button>
        <button type="button" aria-label={saved?"Убрать из сохранённого":"Сохранить"} aria-pressed={saved} className={`g2-post-bookmark ${saved?"selected":""}`} onClick={()=>change(s=>({...s,bookmarkedPostIds:toggleSocialId(s.bookmarkedPostIds,post.id)}))}><Glyph name="bookmark" filled={saved}/></button>
      </div>
      {expandedComments===post.id && <div className="g2-comment-panel">
        <strong className="g2-comment-title">Комментарии</strong>
        {comments.length===0 && <p className="g2-comment-muted">Пока нет комментариев.</p>}
        {comments.map(comment=><div className="g2-comment" key={comment.id}><Avatar name={ownName} imageUrl={playerProfile?.avatarUrl} size="small"/><div><strong>{ownName}</strong><p>{comment.text}</p><small>{ago(comment.createdAt)}</small></div></div>)}
        <form className="g2-comment-form" onSubmit={e=>{e.preventDefault();sendComment(post.id);}}><input aria-label="Новый комментарий" maxLength={500} placeholder="Написать комментарий…" value={commentInput} onChange={e=>setCommentInput(e.target.value)} /><button type="submit" disabled={!commentInput.trim()} aria-label="Отправить комментарий"><Glyph name="send" size={17}/></button></form>
      </div>}
    </article>;
  };
  return <section className="g2-social-network alex-page" aria-label="Соцсеть">
    <div className="g2-social-title"><div><span className="g2-social-kicker">GAME2 SOCIAL</span><h1>{view==="timeline" ? "Лента" : view==="notifications" ? "Уведомления" : view==="alexandra" ? "Александра" : view==="anastasia" ? "Анастасия" : "Мой профиль"}</h1></div>
      <div className="g2-social-title-actions">
        <button type="button" onClick={()=>setView(view==="notifications"?"timeline":"notifications")} aria-label="Уведомления" className={view==="notifications"?"active":""}><Glyph name="bell"/></button>
        <button type="button" onClick={()=>{setView("timeline");setComposer(true);}} aria-label="Новая публикация"><Glyph name="plus"/></button>
      </div>
    </div>
    {error && <div className="g2-social-alert" role="status">{error}<button type="button" onClick={()=>{setError(null);setFlushRequest(v=>v+1);}}>{syncState==="offline"?"Повторить":"×"}</button></div>}
    {view!=="timeline" && <button type="button" className="g2-social-return" onClick={()=>{setView("timeline");setTab("feed");}}><Glyph name="arrow" size={17}/> В ленту</button>}
    {view==="notifications" ? <div className="g2-social-empty-state"><Glyph name="bell" size={32}/><strong>Новых уведомлений нет</strong><span>Здесь появятся реакции и события, когда в мире Game2 заработают самостоятельные социальные действия персонажей.</span></div> : <>
      {view==="timeline" ? <>
        <div className="g2-social-quick-profile">
          <button type="button" aria-label="Мой профиль в соцсети" onClick={()=>openProfile("player")}><Avatar name={ownName} imageUrl={playerProfile?.avatarUrl}/></button>
          <button type="button" className="g2-social-compose-trigger" onClick={()=>setComposer(true)}>О чём думаешь?</button>
          <button type="button" onClick={()=>setComposer(true)} aria-label="Добавить фотографию"><Glyph name="plus" size={20}/></button>
        </div>
        <div className="g2-social-stories"><button type="button" onClick={()=>openProfile("player")}><Avatar name={ownName} imageUrl={playerProfile?.avatarUrl}/><span>Мой профиль</span></button><button type="button" onClick={()=>openProfile("alexandra_v1")}><Avatar name="Александра" imageUrl={alexandraProfile.avatarUrl}/><span>Александра</span></button><button type="button" onClick={()=>openProfile("anastasia_v1")}><Avatar name="Анастасия" imageUrl={anastasiaProfile.avatarUrl}/><span>Анастасия</span></button></div>
        <label className="g2-social-search"><Glyph name="search" size={19}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск публикаций…" aria-label="Поиск публикаций" /></label>
        <div className="g2-social-tabs" role="group" aria-label="Фильтр публикаций">{([['feed','Для тебя'],['following','Подписки'],['saved','Сохранённое'],['mine','Мои']] as const).map(([id,name])=><button type="button" key={id} className={tab===id?"selected":""} aria-pressed={tab===id} onClick={()=>setTab(id)}>{name}</button>)}</div>
      </> : <div className="g2-social-person-profile">
        <div className="g2-social-cover" />
        <div className="g2-social-profile-details"><Avatar name={view==="player"?ownName:viewedProfile.core.name} imageUrl={view==="player"?playerProfile?.avatarUrl:viewedProfile.avatarUrl} size="large"/>
          <h2>{view==="player"?ownName:viewedProfile.core.name}</h2><small>{view==="player"?ownHandle:`@${viewedProfile.handle}`}</small>
          <p>{view==="player"?(playerProfile?.bio||"Добавь описание своего профиля."):viewedProfile.bio}</p>
          <div className="g2-social-profile-stats"><span><strong>{(view==="player"?social.ownPosts.length:viewedPostCount)}</strong> публикаций</span><span><strong>{view==="player"?social.followingIds.length:(viewedFollowing?1:0)}</strong> подписок в игре</span></div>
          {view==="player"?<button type="button" className="g2-social-primary" onClick={onMyProfile}>Редактировать профиль</button>:<div className="g2-social-profile-ctas"><button type="button" className="g2-social-primary" onClick={()=>onMessage(viewedProfile.id)}>Написать</button><button type="button" className="g2-social-outline" aria-pressed={viewedFollowing} onClick={()=>change(s=>({...s,followingIds:toggleSocialId(s.followingIds,viewedProfile.id)}))}>{viewedFollowing?"Вы подписаны":"Подписаться"}</button></div>}
        </div>
      </div>}
      <div className="g2-social-posts" aria-live="polite">
        {filteredPosts.length ? filteredPosts.map(displayPost) : <div className="g2-social-empty-state"><Glyph name="search" size={28}/><strong>Здесь пока пусто</strong><span>{tab==="following"?"Подпишись на Александру или Анастасию, чтобы видеть их публикации в этом разделе.":"Публикаций по этому запросу нет."}</span></div>}
      </div>
      <div className="g2-social-sync-note">{syncState==="saving"?"Сохраняем изменения…":syncState==="offline"?"Изменения сохранены на устройстве":"Лента синхронизирована"} · Личные социальные данные Game2</div>
    </>}
    {composer && <div className="g2-social-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setComposer(false);}}><section className="g2-social-composer" role="dialog" aria-modal="true" aria-label="Новая публикация">
      <header><strong>Новая публикация</strong><button type="button" onClick={()=>setComposer(false)} aria-label="Закрыть"><Glyph name="close" size={20}/></button></header>
      <div className="g2-compose-author"><Avatar name={ownName} imageUrl={playerProfile?.avatarUrl} size="small"/><div><strong>{ownName}</strong><small>Твоя страница</small></div></div>
      <textarea rows={6} autoFocus placeholder="Поделись мыслями…" maxLength={1200} value={postText} onChange={e=>setPostText(e.target.value)} aria-label="Текст публикации"/>
      <label className="g2-compose-image">Фотография (ссылка HTTPS)<input type="url" placeholder="https://example.com/photo.jpg" value={postImage} onChange={e=>setPostImage(e.target.value)}/></label>
      {postImage.startsWith("https://") && <img src={postImage} alt="Предпросмотр фотографии" className="g2-compose-preview" referrerPolicy="no-referrer" />}
      <footer><small>{postText.length}/1200</small><button type="button" onClick={publish} disabled={!postText.trim()&&!postImage.trim()}>Опубликовать</button></footer>
    </section></div>}
  </section>;
}
