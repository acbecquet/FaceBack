import { afterEach, expect, test } from "vitest";
import { addItem, listItems, deleteItems, newId } from "./collection";
import type { CollectionItem } from "../types";

afterEach(
  () =>
    new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("faceback-collection");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    }),
);

function item(id: string, createdAt: string): CollectionItem {
  return {
    id,
    imageBlob: new Blob([id], { type: "image/jpeg" }),
    mimeType: "image/jpeg",
    width: 10,
    height: 10,
    createdAt,
  };
}

test("addItem then listItems returns stored items, newest first", async () => {
  await addItem(item("a", "2026-01-01T00:00:00.000Z"));
  await addItem(item("b", "2026-01-02T00:00:00.000Z"));
  const items = await listItems();
  expect(items.map((i) => i.id)).toEqual(["b", "a"]);
});

test("deleteItems removes multiple items by id", async () => {
  await addItem(item("a", "2026-01-01T00:00:00.000Z"));
  await addItem(item("b", "2026-01-02T00:00:00.000Z"));
  await addItem(item("c", "2026-01-03T00:00:00.000Z"));
  await deleteItems(["a", "c"]);
  const items = await listItems();
  expect(items.map((i) => i.id)).toEqual(["b"]);
});

// Reads the raw stored record, bypassing listItems' reconstruction, to prove
// what actually lands in IndexedDB.
function rawStored(): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("faceback-collection", 1);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction("collection", "readonly").objectStore("collection").getAll();
      req.onsuccess = () => {
        db.close();
        resolve(req.result as Array<Record<string, unknown>>);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    };
    open.onerror = () => reject(open.error);
  });
}

// iOS/WebKit has long-standing bugs storing Blob objects in IndexedDB (the
// write fails or reads back empty), which silently left "Your Backs" empty on
// iPhone. We persist the raw bytes instead, so nothing stored is ever a Blob.
test("stores image bytes as an ArrayBuffer, never a Blob (WebKit IndexedDB safety)", async () => {
  await addItem(item("a", "2026-01-01T00:00:00.000Z"));
  const raw = await rawStored();
  expect(raw).toHaveLength(1);
  // Realm-robust check: fake-indexeddb's structured clone rebuilds the
  // ArrayBuffer in another realm, so `instanceof ArrayBuffer` is unreliable
  // here; the tag and byteLength confirm it is genuine array-buffer bytes.
  expect(Object.prototype.toString.call(raw[0].bytes)).toBe("[object ArrayBuffer]");
  expect((raw[0].bytes as ArrayBuffer).byteLength).toBeGreaterThan(0);
  expect(raw[0].bytes).not.toBeInstanceOf(Blob);
  expect(raw[0].imageBlob).toBeUndefined();
});

test("listItems reconstructs a Blob with the original bytes and mime type", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  await addItem({
    id: "x",
    imageBlob: new Blob([bytes], { type: "image/png" }),
    mimeType: "image/png",
    width: 3,
    height: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const [got] = await listItems();
  expect(got.imageBlob).toBeInstanceOf(Blob);
  expect(got.imageBlob.type).toBe("image/png");
  expect(new Uint8Array(await got.imageBlob.arrayBuffer())).toEqual(bytes);
});

test("newId returns unique 128-bit hex ids without relying on crypto.randomUUID", () => {
  const a = newId();
  const b = newId();
  expect(a).toMatch(/^[0-9a-f]{32}$/);
  expect(a).not.toBe(b);
});
