/** Personal social-feed sandbox. Kept separate from character SCHEMA_VERSION=4.
 *  The current Firestore rules grant access only under users/{uid}; this data
 *  is therefore a private simulation, NOT a public cross-user social network.
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb, isFirebaseConfigured } from "./firebase";

export type SocialAuthorId = "alexandra_v1" | "player";
export interface SocialPost {
  id: string;
  authorId: SocialAuthorId;
  text: string;
  imageUrl: string;
  createdAt: number;
}
export interface SocialComment {
  id: string;
  postId: string;
  authorId: "player";
  text: string;
  createdAt: number;
}
export interface SocialState {
  version: 1;
  ownPosts: SocialPost[];
  comments: SocialComment[];
  likedPostIds: string[];
  bookmarkedPostIds: string[];
  followingIds: string[];
  updatedAt: number;
}

// Fictional character posts: seed content, not generated messages or fake live activity.
export const ALEXANDRA_SOCIAL_POSTS: readonly SocialPost[] = [
  { id: "alex-post-study", authorId: "alexandra_v1", text: "Пытаюсь совместить работу и учёбу. Пока получается в основном пить кофе и делать списки дел.", imageUrl: "", createdAt: Date.UTC(2026, 9, 17, 21, 5) },
  { id: "alex-post-office", authorId: "alexandra_v1", text: "Иногда кажется, что мой рабочий день состоит из бесконечных встреч, которые нужно перенести на другое время. Но сегодня хотя бы всё успела.", imageUrl: "", createdAt: Date.UTC(2026, 9, 16, 16, 40) },
  { id: "alex-post-evening", authorId: "alexandra_v1", text: "Вечер без планов — редкая роскошь. Музыка, книга, телефон на беззвучном. Идеально.", imageUrl: "", createdAt: Date.UTC(2026, 9, 14, 19, 20) },
];

export function emptySocialState(): SocialState {
  return { version: 1, ownPosts: [], comments: [], likedPostIds: [], bookmarkedPostIds: [], followingIds: [], updatedAt: 0 };
}
const str = (v: unknown, limit: number) => typeof v === "string" ? v.trim().slice(0, limit) : "";
export function safeSocialImageUrl(value: unknown): string {
  const raw = str(value, 1600);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port && parsed.hostname.includes(".") ? raw : "";
  } catch { return ""; }
}
const isId = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{3,110}$/.test(value);
const ids = (v: unknown, limit = 300): string[] => [...new Set((Array.isArray(v) ? v : []).filter(isId))].slice(0, limit) as string[];
export function sanitizeSocialState(value: unknown): SocialState {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const ownPosts: SocialPost[] = (Array.isArray(raw.ownPosts) ? raw.ownPosts : [])
    .filter(v => v && typeof v === "object" && isId(v.id) && Number.isFinite(v.createdAt))
    .slice(0, 80)
    .map(v => ({ id: String(v.id), authorId: "player" as const, text: str(v.text, 1200),
      imageUrl: safeSocialImageUrl(v.imageUrl), createdAt: Number(v.createdAt) }))
    .filter(v => v.text || v.imageUrl);
  const comments: SocialComment[] = (Array.isArray(raw.comments) ? raw.comments : [])
    .filter(v => v && typeof v === "object" && isId(v.id) && isId(v.postId) && Number.isFinite(v.createdAt))
    .slice(0, 250)
    .map(v => ({ id: String(v.id), postId: String(v.postId), authorId: "player" as const,
      text: str(v.text, 500), createdAt: Number(v.createdAt) }))
    .filter(v => v.text);
  return {
    version: 1, ownPosts, comments,
    likedPostIds: ids(raw.likedPostIds), bookmarkedPostIds: ids(raw.bookmarkedPostIds),
    followingIds: ids(raw.followingIds, 30).filter(id => id === "alexandra_v1"),
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : 0,
  };
}
const keyFor = (uid: string | null) => `game2:social:v1:${uid ?? "local-dev"}`;
export function readCachedSocialState(uid: string | null): SocialState {
  try { return sanitizeSocialState(JSON.parse(localStorage.getItem(keyFor(uid)) || "null")); }
  catch { return emptySocialState(); }
}
export function cacheSocialState(uid: string | null, state: SocialState): void {
  try { localStorage.setItem(keyFor(uid), JSON.stringify(sanitizeSocialState(state))); }
  catch { /* Browsing still works when local storage is disabled. */ }
}
function socialDoc(uid: string) {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase недоступен.");
  return doc(db, "users", uid, "social", "feed");
}
export async function fetchSocialState(uid: string | null): Promise<SocialState> {
  if (!isFirebaseConfigured) return readCachedSocialState(uid);
  if (!uid) throw new Error("Для синхронизации соцсети требуется вход.");
  const result = await getDoc(socialDoc(uid));
  return sanitizeSocialState(result.exists() ? result.data() : null);
}
export async function uploadSocialState(uid: string | null, state: SocialState): Promise<void> {
  if (!isFirebaseConfigured) return;
  if (!uid) throw new Error("Для синхронизации соцсети требуется вход.");
  await setDoc(socialDoc(uid), sanitizeSocialState(state));
}
export function createSocialPost(text: string, imageUrl: string, timestamp = Date.now()): SocialPost {
  const normalizedText = str(text, 1200);
  const normalizedImage = safeSocialImageUrl(imageUrl);
  if (!normalizedText && !normalizedImage) throw new Error("Добавь текст или фотографию.");
  if (str(imageUrl, 1600) && !normalizedImage) throw new Error("Нужна прямая ссылка на изображение по HTTPS.");
  return { id: `post_${crypto.randomUUID().replace(/-/g, "")}`, authorId: "player", text: normalizedText,
    imageUrl: normalizedImage, createdAt: timestamp };
}
export function createSocialComment(postId: string, text: string): SocialComment {
  const cleaned = str(text, 500);
  if (!isId(postId) || !cleaned) throw new Error("Напиши комментарий.");
  return { id: `comment_${crypto.randomUUID().replace(/-/g, "")}`, postId, authorId: "player", text: cleaned, createdAt: Date.now() };
}
export function toggleSocialId(list: readonly string[], id: string): string[] {
  if (!isId(id)) return [...list];
  return list.includes(id) ? list.filter(v => v !== id) : [id, ...list].slice(0, 300);
}
