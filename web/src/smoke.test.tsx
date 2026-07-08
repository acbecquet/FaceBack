import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import { meApi } from "./units/apiClient";

vi.mock("./units/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./units/apiClient")>();
  return {
    ...actual,
    meApi: { get: vi.fn() },
  };
});

beforeEach(() => {
  localStorage.clear();
  vi.mocked(meApi.get).mockReset();
});

test("first run shows the SignIn screen", async () => {
  vi.mocked(meApi.get).mockResolvedValue(null);
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: /send code/i })).toBeInTheDocument());
});

test("test environment exposes crypto.subtle and indexedDB", () => {
  expect(globalThis.crypto.subtle).toBeDefined();
  expect(globalThis.indexedDB).toBeDefined();
});
