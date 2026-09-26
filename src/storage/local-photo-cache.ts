const DB_NAME = "yuzuki-social-local-photos";
const DB_VERSION = 1;
const STORE_NAME = "photos";

export interface LocalPhotoRecord {
  id: string;
  characterId: string;
  messageId: string;
  mimeType: string;
  dataUrl: string;
  createdAt: number;
  promptSummary?: string;
}

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("byCharacter", "characterId", { unique: false });
        store.createIndex("byCreatedAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("local-photo-db-open-failed"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => void | Promise<T>): Promise<T> {
  const db = await openDb();
  if (!db) throw new Error("indexeddb-unavailable");
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    Promise.resolve(run(store))
      .then((value) => {
        tx.oncomplete = () => {
          db.close();
          resolve(value as T);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("local-photo-transaction-failed"));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("local-photo-transaction-aborted"));
        };
      })
      .catch((error) => {
        db.close();
        reject(error);
      });
  });
}

export async function saveLocalPhoto(record: LocalPhotoRecord) {
  return withStore<void>("readwrite", (store) => {
    store.put(record);
  });
}

export async function loadLocalPhoto(id: string) {
  return withStore<LocalPhotoRecord | null>("readonly", (store) => new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as LocalPhotoRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("local-photo-read-failed"));
  }));
}
