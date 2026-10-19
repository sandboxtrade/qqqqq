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
export type VirtualTransactionKind = "gift" | "transfer" | "topup";
export interface VirtualTransaction {
  id: string;
  kind: VirtualTransactionKind;
  characterId: string;
  label: string;
  amount: number;
  createdAt: number;
}
export interface CompanionExpense { id: string; label: string; amount: number; createdAt: number; }
export interface CompanionFinance {
  balance: number;
  receivedTotal: number;
  gifts: { id: string; label: string; value: number; createdAt: number }[];
  expenses: CompanionExpense[];
  /** Significant economic events are durable, but NOT part of automatic chat memory. */
  notableEvents: { id: string; text: string; createdAt: number }[];
  lastExpenseDay: string;
}
export interface VirtualWallet {
  balance: number;
  transactions: VirtualTransaction[];
  companions: Record<string, CompanionFinance>;
  appliedIds: string[];
}
export const WORLD_AVERAGE_MONTHLY_SALARY = 2000;
export const MAX_DEV_TOPUP = 1000000;
export const DEFAULT_COMPANION_FINANCE: CompanionFinance = {
  balance: 0, receivedTotal: 0, gifts: [], expenses: [], notableEvents: [], lastExpenseDay: "",
};
export function formatGameMoney(amount: number): string { return `$${Math.round(amount).toLocaleString("en-US")}`; }
export function salaryEquivalent(amount: number): number { return amount / WORLD_AVERAGE_MONTHLY_SALARY; }
export function economicSignificance(amount: number): "ordinary" | "noticeable" | "major" | "life_changing" {
  const relative = salaryEquivalent(amount);
  return relative >= 1 ? "life_changing" : relative >= .25 ? "major" : relative >= .05 ? "noticeable" : "ordinary";
}
const ECONOMY_EVENT_PREFIX = "[GAME2:ECONOMY:1]";
export function encodeEconomyEvent(transaction: VirtualTransaction): string {
  return ECONOMY_EVENT_PREFIX + JSON.stringify({ id: transaction.id, kind: transaction.kind,
    amount: transaction.amount, label: transaction.label, characterId: transaction.characterId });
}
export function decodeEconomyEvent(text: string): Pick<VirtualTransaction,"id"|"kind"|"amount"|"label"|"characterId"> | null {
  if (!text.startsWith(ECONOMY_EVENT_PREFIX)) return null;
  try {
    const value = JSON.parse(text.slice(ECONOMY_EVENT_PREFIX.length));
    if (!value || typeof value !== "object" || !/^economy_[a-f0-9-]{36}$/.test(value.id)
      || !["gift", "transfer"].includes(value.kind) || !Number.isSafeInteger(value.amount)
      || value.amount <= 0 || value.amount > 50000 || typeof value.label !== "string"
      || !/^[\w.-]{1,90}$/.test(value.characterId)) return null;
    return { id: value.id, kind: value.kind, amount: value.amount,
      label: value.label.slice(0,90), characterId: value.characterId };
  } catch { return null; }
}
export function economyEventContext(transaction: Pick<VirtualTransaction,"kind"|"amount"|"label">): string {
  const relative = salaryEquivalent(transaction.amount);
  const level = economicSignificance(transaction.amount);
  const description = transaction.kind === "transfer"
    ? `Пользователь перевёл девушке ${formatGameMoney(transaction.amount)} на её личный виртуальный счёт.`
    : `Пользователь подарил девушке «${transaction.label}» (стоимость ${formatGameMoney(transaction.amount)}).`;
  return `[РЕАЛЬНОЕ ИГРОВОЕ СОБЫТИЕ — НЕ РЕПЛИКА ПОЛЬЗОВАТЕЛЯ] ${description} Средняя месячная зарплата в мире: $2,000. Размер события: ${relative.toFixed(2)} зарплаты; значимость: ${level}. Реагируй по своему характеру и текущим отношениям: на крупную сумму — сильное удивление, возможная неловкость или сомнения, искренняя благодарность, если принимает; это событие может запомниться надолго. Не обещай любовь или близость за деньги. Не повторяй буквально служебное описание. Не утверждай, что уже потратила деньги без подтверждённых расходов.`;
}

export const INITIAL_VIRTUAL_BALANCE = 3000;
export const GIFT_CATALOG = [
  { id: "coffee", label: "Кофе", price: 150 },
  { id: "flowers", label: "Букет цветов", price: 450 },
  { id: "book", label: "Книга", price: 650 },
  { id: "headphones", label: "Наушники", price: 1200 },
] as const;
export const TRANSFER_AMOUNTS = [100, 500, 1000, 2000, 5000] as const;
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
  const transactions = (Array.isArray(value.transactions) ? value.transactions : []).slice(0, 80)
    .filter(entry => entry && typeof entry === "object" && typeof entry.id === "string"
      && (entry.kind === "gift" || entry.kind === "transfer" || entry.kind === "topup") && Number.isSafeInteger(entry.amount)
      && entry.amount > 0 && Number.isFinite(entry.createdAt))
    .map(entry => ({ id: clean(entry.id, 100), kind: entry.kind as VirtualTransactionKind,
      characterId: clean(entry.characterId, 80), label: clean(entry.label, 90),
      amount: entry.amount as number, createdAt: entry.createdAt as number }));
  const companions: Record<string, CompanionFinance> = {};
  const rawCompanions = value.companions && typeof value.companions === "object" ? value.companions as Record<string, unknown> : {};
  for (const [id, raw] of Object.entries(rawCompanions).slice(0, 30)) {
    if (!/^[\w.-]{1,90}$/.test(id) || !raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const safeInt = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0 ? Number(v) : 0;
    const eventList = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 25).filter(x => x && typeof x === "object" && typeof x.id === "string" && Number.isFinite(x.createdAt));
    companions[id] = {
      balance: safeInt(c.balance), receivedTotal: safeInt(c.receivedTotal),
      gifts: eventList(c.gifts).map(g => ({id:clean(g.id,100),label:clean(g.label,90),value:safeInt(g.value),createdAt:g.createdAt as number})),
      expenses: eventList(c.expenses).map(g => ({id:clean(g.id,100),label:clean(g.label,90),amount:safeInt(g.amount),createdAt:g.createdAt as number})),
      notableEvents: eventList(c.notableEvents).map(g => ({id:clean(g.id,100),text:clean(g.text,400),createdAt:g.createdAt as number})),
      lastExpenseDay: clean(c.lastExpenseDay,10),
    };
  }
  const appliedIds = (Array.isArray(value.appliedIds) ? value.appliedIds : transactions.map(t => t.id))
    .filter((v): v is string => typeof v === "string").slice(0, 300);
  return { balance, transactions, companions, appliedIds };
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
  const start: VirtualWallet = { balance: INITIAL_VIRTUAL_BALANCE, transactions: [], companions: {}, appliedIds: [] };
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
    if (current.appliedIds.includes(transaction.id) || current.transactions.some(entry => entry.id === transaction.id)) return current;
    if (current.balance < transaction.amount) throw new Error("Недостаточно игровых денег.");
    const companion = current.companions[transaction.characterId] ?? { ...DEFAULT_COMPANION_FINANCE };
    const level = economicSignificance(transaction.amount);
    const notableText = level === "major" || level === "life_changing"
      ? transaction.kind === "transfer"
        ? `Пользователь подарил мне ${formatGameMoney(transaction.amount)} (${salaryEquivalent(transaction.amount).toFixed(2)} средней месячной зарплаты). Я помню это как ${level === "life_changing" ? "очень крупный, необычный" : "значительный"} перевод; моя реакция зависит от моего характера и отношений, а не от автоматической покупки симпатии.`
        : `Пользователь подарил мне «${transaction.label}» стоимостью ${formatGameMoney(transaction.amount)}. Это был значимый подарок.`
      : "";
    const updated: CompanionFinance = {
      ...companion,
      balance: companion.balance + (transaction.kind === "transfer" ? transaction.amount : 0),
      receivedTotal: companion.receivedTotal + (transaction.kind === "transfer" ? transaction.amount : 0),
      gifts: transaction.kind === "gift" ? [{id:transaction.id,label:transaction.label,value:transaction.amount,createdAt:transaction.createdAt}, ...companion.gifts].slice(0,25) : companion.gifts,
      notableEvents: notableText ? [{id:transaction.id,text:notableText,createdAt:transaction.createdAt}, ...companion.notableEvents].slice(0,20) : companion.notableEvents,
      lastExpenseDay: transaction.kind === "transfer" && !companion.lastExpenseDay ? new Date(transaction.createdAt).toISOString().slice(0,10) : companion.lastExpenseDay,
    };
    return { balance: current.balance - transaction.amount,
      transactions: [transaction, ...current.transactions].slice(0,80),
      companions: {...current.companions, [transaction.characterId]: updated},
      appliedIds: [transaction.id,...current.appliedIds].slice(0,300) };
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

/** Prototype top-up: no payment gateway. Deliberately not permitted as a real-money operation. */
export async function addVirtualMoney(uid: string | null, amount: number, id: string): Promise<VirtualWallet> {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_DEV_TOPUP || !/^topup_[a-f0-9-]{36}$/.test(id))
    throw new Error("Недопустимая сумма пополнения.");
  const apply = (wallet: VirtualWallet): VirtualWallet => {
    if (wallet.appliedIds.includes(id) || wallet.transactions.some(tx => tx.id === id)) return wallet;
    if (!Number.isSafeInteger(wallet.balance + amount)) throw new Error("Превышен лимит счёта.");
    return {...wallet, balance: wallet.balance + amount, appliedIds:[id,...wallet.appliedIds].slice(0,300),
      transactions:[{id,kind:"topup",characterId:"",label:"Игровое пополнение",amount,createdAt:Date.now()},...wallet.transactions].slice(0,80)};
  };
  if (!isFirebaseConfigured) {
    const updated = apply(await loadVirtualWallet(uid)); localWrite(localKey(uid,"economy"),updated); return updated;
  }
  if (!uid) throw new Error("Нужен вход в аккаунт.");
  const ref = playerDoc(uid,"economy");
  return runTransaction(ref.firestore, async tx => {
    const snap = await tx.get(ref);
    const updated = apply(sanitizeVirtualWallet(snap.exists() ? snap.data() : null));
    tx.set(ref,updated); return updated;
  });
}

/** Companion's own cash, independently persisted; daily optional simulation, not an LLM instruction. */
export async function advanceCompanionExpenses(uid: string | null, characterId: string, now = Date.now()): Promise<VirtualWallet> {
  if (!/^[\w.-]{1,90}$/.test(characterId)) throw new Error("Неизвестный персонаж.");
  const day = new Date(now).toISOString().slice(0,10);
  const apply = (wallet: VirtualWallet): VirtualWallet => {
    const current = wallet.companions[characterId];
    if (!current || !current.balance || current.lastExpenseDay >= day) return wallet;
    const dayOrdinal = Math.floor(now / 86400000);
    const options = ["Дорога на работу", "Продукты домой", "Кофе и обед", "Бытовые покупки"];
    const prices = [18,35,22,45];
    const index = dayOrdinal % options.length;
    const amount = Math.min(current.balance,prices[index]);
    if (amount <= 0) return wallet;
    const expense = {id:`expense_${characterId}_${day}`,label:options[index],amount,createdAt:now};
    return {...wallet,companions:{...wallet.companions,[characterId]:{...current,balance:current.balance-amount,
      lastExpenseDay:day,expenses:[expense,...current.expenses].slice(0,25)}}};
  };
  if (!isFirebaseConfigured) {
    const updated = apply(await loadVirtualWallet(uid));localWrite(localKey(uid,"economy"),updated);return updated;
  }
  if (!uid) throw new Error("Нужен вход в аккаунт.");
  const ref = playerDoc(uid,"economy");
  return runTransaction(ref.firestore,async tx=>{
    const snap=await tx.get(ref);const current=sanitizeVirtualWallet(snap.exists()?snap.data():null);
    const updated=apply(current);if(updated!==current)tx.set(ref,updated);return updated;
  });
}

export async function loadCompanionEconomicContext(uid: string | null, characterId: string): Promise<string> {
  const wallet = await loadVirtualWallet(uid);
  const finance = wallet.companions[characterId];
  if (!finance) return `ЭКОНОМИКА МИРА: средняя месячная зарплата — ${formatGameMoney(WORLD_AVERAGE_MONTHLY_SALARY)}. У девушки есть отдельный виртуальный счёт; подарки и переводы не покупают симпатию.`;
  const meaningful = finance.notableEvents.slice(0,12).map(item => `- ${item.text}`).join("\n");
  const purchases = finance.expenses.slice(0,4).map(e=>`${e.label} (${formatGameMoney(e.amount)})`).join(", ");
  return `ЭКОНОМИКА МИРА: средняя месячная зарплата ${formatGameMoney(WORLD_AVERAGE_MONTHLY_SALARY)}. На личном виртуальном счёте девушки ${formatGameMoney(finance.balance)}. Суммарно ей перевели ${formatGameMoney(finance.receivedTotal)}. Известные траты: ${purchases || "пока нет"}. ЗНАЧИМЫЕ СОБЫТИЯ С ДЕНЬГАМИ (помни их и иногда естественно возвращайся к ним, не благодари на каждой реплике и не изображай симпатию за оплату):\n${meaningful || "нет"}`;
}
