/** Player-owned, additive state. Never modifies companion SCHEMA_VERSION=4 documents.
 *  Currency is a virtual prototype, not a trustworthy paid economy:
 *  current user-owned Firestore rules allow clients to edit their own balances.
 *  Before selling credits migrate spending and minting to server-authoritative transactions.
 */
import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import { getFirebaseDb, isFirebaseConfigured } from "./firebase";

export type ProfileTheme = "rose" | "midnight" | "ocean" | "sage";
export interface PlayerProfile {
  displayName: string;
  handle: string;
  bio: string;
  city: string;
  interests: string;
  status: string;
  avatarUrl: string;
  theme: ProfileTheme;
  discoverable: boolean;
  updatedAt: number;
}
export type VirtualTransactionKind = "gift" | "transfer";
export interface VirtualTransaction {
  id: string;
  kind: VirtualTransactionKind;
  characterId: string;
  label: string;
  amount: number;
  createdAt: number;
}
export interface VirtualWallet {
  balance: number;
  transactions: VirtualTransaction[];
}
export const INITIAL_VIRTUAL_BALANCE = 3000;
export const GIFT_CATALOG = [
  { id: "coffee", label: "Кофе", price: 150 },
  { id: "flowers", label: "Букет цветов", price: 450 },
  { id: "book", label: "Книга", price: 650 },
  { id: "headphones", label: "Наушники", price: 1200 },
] as const;
export const TRANSFER_AMOUNTS = [100, 500, 1000] as const;
const themes: readonly ProfileTheme[] = ["rose", "midnight", "ocean", "sage"];
const START_PROFILE: PlayerProfile = {
  displayName: "Игрок", handle: "", bio: "", city: "", interests: "", status: "",
  avatarUrl: "", theme: "rose", discoverable: false, updatedAt: 0,
};
const localKey = (uid: string | null, key: string) => `game2:player:v1:${uid ?? "local-dev"}:${key}`;
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const publicPhoto = (url: unknown) => {
  const raw = clean(url, 1500);
  if (!raw) return "";
  try { const target = new URL(raw); return target.protocol === "https:" && !target.username && !target.password ? raw : ""; }
  catch { return ""; }
};
export function sanitizePlayerProfile(raw: unknown): PlayerProfile {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    displayName: clean(value.displayName, 48) || START_PROFILE.displayName,
    handle: clean(value.handle, 24).replace(/[^\p{L}\p{N}_.-]/gu, ""),
    bio: clean(value.bio, 420), city: clean(value.city, 64),
    interests: clean(value.interests, 240), status: clean(value.status, 90),
    avatarUrl: publicPhoto(value.avatarUrl),
    theme: themes.includes(value.theme as ProfileTheme) ? value.theme as ProfileTheme : "rose",
    discoverable: value.discoverable === true,
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : 0,
  };
}
export function sanitizeVirtualWallet(raw: unknown): VirtualWallet {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const balance = Number.isSafeInteger(value.balance) && Number(value.balance) >= 0 ? Number(value.balance) : INITIAL_VIRTUAL_BALANCE;
  const transactions = (Array.isArray(value.transactions) ? value.transactions : []).slice(0, 50)
    .filter(entry => entry && typeof entry === "object" && typeof entry.id === "string"
      && (entry.kind === "gift" || entry.kind === "transfer") && Number.isSafeInteger(entry.amount)
      && entry.amount > 0 && Number.isFinite(entry.createdAt))
    .map(entry => ({ id: clean(entry.id, 100), kind: entry.kind as VirtualTransactionKind,
      characterId: clean(entry.characterId, 80), label: clean(entry.label, 90),
      amount: entry.amount as number, createdAt: entry.createdAt as number }));
  return { balance, transactions };
}
function localRead<T>(key: string, fallback: T, decode: (data: unknown) => T): T {
  try { const value = window.localStorage.getItem(key); return value ? decode(JSON.parse(value)) : fallback; }
  catch { return fallback; }
}
function localWrite(key: string, data: unknown): void { window.localStorage.setItem(key, JSON.stringify(data)); }
function playerDoc(uid: string, name: "profile" | "economy") {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase недоступен.");
  return doc(db, "users", uid, "player", name);
}
export async function loadPlayerProfile(uid: string | null): Promise<PlayerProfile> {
  if (!isFirebaseConfigured) return localRead(localKey(uid, "profile"), START_PROFILE, sanitizePlayerProfile);
  if (!uid) throw new Error("Для профиля требуется вход.");
  const snapshot = await getDoc(playerDoc(uid, "profile"));
  return sanitizePlayerProfile(snapshot.exists() ? snapshot.data() : null);
}
export async function savePlayerProfile(uid: string | null, value: PlayerProfile): Promise<PlayerProfile> {
  const normalized = sanitizePlayerProfile({ ...value, updatedAt: Date.now() });
  if (!isFirebaseConfigured) localWrite(localKey(uid, "profile"), normalized);
  else { if (!uid) throw new Error("Для сохранения профиля требуется вход."); await setDoc(playerDoc(uid, "profile"), normalized); }
  return normalized;
}
export async function loadVirtualWallet(uid: string | null): Promise<VirtualWallet> {
  const start: VirtualWallet = { balance: INITIAL_VIRTUAL_BALANCE, transactions: [] };
  if (!isFirebaseConfigured) return localRead(localKey(uid, "economy"), start, sanitizeVirtualWallet);
  if (!uid) throw new Error("Для кошелька требуется вход.");
  const snapshot = await getDoc(playerDoc(uid, "economy"));
  return sanitizeVirtualWallet(snapshot.exists() ? snapshot.data() : null);
}
export async function spendVirtualCurrency(
  uid: string | null, transaction: VirtualTransaction,
): Promise<VirtualWallet> {
  if (!Number.isSafeInteger(transaction.amount) || transaction.amount <= 0 || transaction.amount > 50000 ||
      !/^[\w.-]{1,90}$/u.test(transaction.characterId) || !transaction.id ||
      !["gift", "transfer"].includes(transaction.kind)) throw new Error("Некорректная виртуальная операция.");
  // The UI provides an immutable transaction ID. If retried, it cannot debit twice.
  const apply = (current: VirtualWallet): VirtualWallet => {
    if (current.transactions.some(entry => entry.id === transaction.id)) return current;
    if (current.balance < transaction.amount) throw new Error("Недостаточно виртуальных монет.");
    return { balance: current.balance - transaction.amount,
      transactions: [transaction, ...current.transactions].slice(0, 50) };
  };
  if (!isFirebaseConfigured) {
    const key = localKey(uid, "economy");
    const result = apply(await loadVirtualWallet(uid));
    localWrite(key, result);
    return result;
  }
  if (!uid) throw new Error("Для кошелька требуется вход.");
  const ref = playerDoc(uid, "economy");
  return runTransaction(ref.firestore, async tx => {
    const snapshot = await tx.get(ref);
    const result = apply(sanitizeVirtualWallet(snapshot.exists() ? snapshot.data() : null));
    tx.set(ref, result);
    return result;
  });
}
