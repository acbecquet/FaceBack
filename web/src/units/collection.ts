import type { CollectionItem } from "../types";

// A dedicated database, separate from the keystore's "faceback" DB, so the two
// have independent schema versions and their openers never conflict.
const DB_NAME = "faceback-collection";
const STORE = "collection";

// What actually lands in IndexedDB. We persist the image as raw `bytes`
// (ArrayBuffer), never as a Blob: iOS/WebKit has long-standing bugs storing
// Blob objects in IndexedDB (the write fails or reads back empty), which left
// "Your Backs" silently empty on iPhone. ArrayBuffers structured-clone
// reliably on every engine. `imageBlob` is only ever read, for tolerance of
// any records written by an earlier Blob-based build.
interface StoredItem {
  id: string;
  bytes?: ArrayBuffer;
  imageBlob?: Blob;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string;
}

// A random 128-bit id as lowercase hex. Uses crypto.getRandomValues (available
// on every browser we target) rather than crypto.randomUUID, which is missing
// on older WebKit and would throw here - the one other way this path could
// have failed silently on iPhone.
export function newId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

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
  const bytes = await item.imageBlob.arrayBuffer();
  const stored: StoredItem = {
    id: item.id,
    bytes,
    mimeType: item.mimeType,
    width: item.width,
    height: item.height,
    createdAt: item.createdAt,
  };
  await run("readwrite", (s) => s.put(stored));
}

export async function listItems(): Promise<CollectionItem[]> {
  const items = await run<StoredItem[]>("readonly", (s) => s.getAll() as IDBRequest<StoredItem[]>);
  return (items ?? [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((s) => ({
      id: s.id,
      imageBlob: s.bytes ? new Blob([s.bytes], { type: s.mimeType }) : (s.imageBlob as Blob),
      mimeType: s.mimeType,
      width: s.width,
      height: s.height,
      createdAt: s.createdAt,
    }));
}

export async function deleteItems(ids: string[]): Promise<void> {
  await run("readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
}
