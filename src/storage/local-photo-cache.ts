const DB_NAME = "yuzuki-social-local-photos";
const DB_VERSION = 1;
const STORE_NAME = "photos";

export interface LocalPhotoRecord {
  id: string;
  ownerUid?: string;
  characterId: string;
  messageId: string;
  mimeType: string;
  dataUrl: string;
  createdAt: number;
  promptSummary?: string;
  model?: string;
  provider?: "openai" | "wavespeed";
  primaryFailure?: string;
  primaryDetail?: string;
  providerTaskId?: string;
}

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => fail(new Error("local-photo-db-open-timeout")), 6000);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("byCharacter", "characterId", { unique: false });
        store.createIndex("byCreatedAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      clearTimeout(timer);
      resolve(request.result);
    };
    request.onblocked = () => fail(new Error("local-photo-db-blocked"));
    request.onerror = () => fail(request.error ?? new Error("local-photo-db-open-failed"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => void | Promise<T>): Promise<T> {
  const db = await openDb();
  if (!db) throw new Error("indexeddb-unavailable");
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    let settled = false;
    let completed = false;
    let returned = false;
    let value: T;
    const finish = (error?: unknown) => {
      if (settled) return;
      if (!error && (!completed || !returned)) return;
      settled = true;
      clearTimeout(timer);
      db.close();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      try { tx.abort(); } catch { /* already complete */ }
      finish(new Error("local-photo-transaction-timeout"));
    }, 12000);
    tx.oncomplete = () => { completed = true; finish(); };
    tx.onerror = () => finish(tx.error ?? new Error("local-photo-transaction-failed"));
    tx.onabort = () => finish(tx.error ?? new Error("local-photo-transaction-aborted"));
    try {
      Promise.resolve(run(tx.objectStore(STORE_NAME))).then((result) => {
        value = result as T;
        returned = true;
        finish();
      }, (error) => finish(error));
    } catch (error) { finish(error); }
  });
}

export async function saveLocalPhoto(record: LocalPhotoRecord) {
  return withStore<void>("readwrite", (store) => {
    store.put({ ...record, id: record.ownerUid ? JSON.stringify([record.ownerUid, record.id]) : record.id });
  });
}

export async function loadLocalPhoto(id: string, uid?: string | null): Promise<LocalPhotoRecord | null> {
  if (uid) {
    const scoped = await loadLocalPhoto(JSON.stringify([uid, id]));
    if (scoped) return scoped;
    const legacy = await loadLocalPhoto(id);
    return legacy && (!legacy.ownerUid || legacy.ownerUid === uid) ? legacy : null;
  }
  return withStore<LocalPhotoRecord | null>("readonly", (store) => new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as LocalPhotoRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("local-photo-read-failed"));
  }));
}
