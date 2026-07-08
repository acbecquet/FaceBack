import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import App from "./App";

beforeEach(() => localStorage.clear());

test("first run shows the SignIn screen", async () => {
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: /send code/i })).toBeInTheDocument());
});

test("test environment exposes crypto.subtle and indexedDB", () => {
  expect(globalThis.crypto.subtle).toBeDefined();
  expect(globalThis.indexedDB).toBeDefined();
});
