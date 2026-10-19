/** Local journal for user turns not yet confirmed by Firestore. Does not change schema 4. */
export interface StoredUserTurn {
  id: string;
  role: "user";
  text: string;
  timestamp: number;
  contextText?: string;
}
const PREFIX = "game2-unsent-v1:";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
function key(uid: string | null, characterId: string): string {
  return PREFIX + JSON.stringify([uid ?? "local", characterId]);
}
function valid(value: unknown): value is StoredUserTurn {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredUserTurn>;
  return item.role === "user" && typeof item.id === "string" &&
    item.id.length > 0 && item.id.length < 180 &&
    typeof item.text === "string" && item.text.length <= 12000 &&
    typeof item.timestamp === "number" && Number.isFinite(item.timestamp) &&
    item.timestamp > Date.now() - MAX_AGE_MS && item.timestamp <= Date.now() + 86400000;
}
export function readUnsentTurns(uid: string | null, characterId: string): StoredUserTurn[] {
  try {
    const array: unknown = JSON.parse(localStorage.getItem(key(uid, characterId)) || "[]");
    if (!Array.isArray(array)) return [];
    return array.filter(valid).slice(-40);
  } catch { return []; }
}
export function rememberUnsentTurn(uid: string | null, characterId: string, message: StoredUserTurn): void {
  if (!valid(message)) return;
  try {
    const earlier = readUnsentTurns(uid, characterId).filter((item) => item.id !== message.id);
    localStorage.setItem(key(uid, characterId), JSON.stringify([...earlier, message].slice(-40)));
  } catch { /* Existing in-memory retry still works if browser storage is restricted. */ }
}
export function forgetUnsentTurn(uid: string | null, characterId: string, id: string): void {
  try {
    const remaining = readUnsentTurns(uid, characterId).filter((item) => item.id !== id);
    if (remaining.length) localStorage.setItem(key(uid, characterId), JSON.stringify(remaining));
    else localStorage.removeItem(key(uid, characterId));
  } catch { /* best effort */ }
}
export function clearUnsentTurns(uid: string | null, characterId: string): void {
  try { localStorage.removeItem(key(uid, characterId)); } catch { /* best effort */ }
}
