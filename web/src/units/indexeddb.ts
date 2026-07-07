import type { WrappingKeyStore } from "./keystore";

const DB_NAME = "faceback";
const STORE = "keys";
const KEY_ID = "wrappingKey";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = run(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
        t.onabort = () => db.close();
      }),
  );
}

export function createIndexedDbWrappingKeyStore(): WrappingKeyStore {
  return {
    async get() {
      const value = await tx<CryptoKey | undefined>("readonly", (s) => s.get(KEY_ID));
      return value ?? null;
    },
    async set(key) {
      await tx("readwrite", (s) => s.put(key, KEY_ID));
    },
  };
}
