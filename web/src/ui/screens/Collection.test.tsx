import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Collection } from "./Collection";
import * as store from "../../units/collection";
import type { CollectionItem } from "../../types";

const items: CollectionItem[] = [
  { id: "a", imageBlob: new Blob(["a"]), mimeType: "image/jpeg", width: 10, height: 10, createdAt: "2026-01-02T00:00:00Z" },
  { id: "b", imageBlob: new Blob(["b"]), mimeType: "image/jpeg", width: 10, height: 10, createdAt: "2026-01-01T00:00:00Z" },
];

beforeEach(() => {
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:x");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

test("selecting items and deleting calls deleteItems with the chosen ids", async () => {
  vi.spyOn(store, "listItems").mockResolvedValue(items);
  const del = vi.spyOn(store, "deleteItems").mockResolvedValue();
  render(<Collection onBack={() => {}} />);

  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  fireEvent.click(screen.getByRole("button", { name: /select/i }));
  fireEvent.click(screen.getByTestId("tile-a"));
  fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  await waitFor(() => expect(del).toHaveBeenCalledWith(["a"]));
});
