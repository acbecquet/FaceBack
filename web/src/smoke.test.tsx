import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the FaceBack wordmark", () => {
  render(<App />);
  expect(screen.getByText("FaceBack")).toBeInTheDocument();
});

test("test environment exposes crypto.subtle and indexedDB", () => {
  expect(globalThis.crypto.subtle).toBeDefined();
  expect(globalThis.indexedDB).toBeDefined();
});
