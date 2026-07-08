import { afterEach, expect, test } from "vitest";
import { addItem, listItems, deleteItems } from "./collection";
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
