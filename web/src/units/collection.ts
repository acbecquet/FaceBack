import type { CollectionItem } from "../types";

// A dedicated database, separate from the keystore's "faceback" DB, so the two
// have independent schema versions and their openers never conflict.
const DB_NAME = "faceback-collection";
const STORE = "collection";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result: T;
        const req = fn(store);
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => {
          db.close();
          resolve(result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
        t.onabort = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

export async function addItem(item: CollectionItem): Promise<void> {
  await run("readwrite", (s) => s.put(item));
}

export async function listItems(): Promise<CollectionItem[]> {
  const items = await run<CollectionItem[]>("readonly", (s) => s.getAll() as IDBRequest<CollectionItem[]>);
  return (items ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteItems(ids: string[]): Promise<void> {
  await run("readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
}
