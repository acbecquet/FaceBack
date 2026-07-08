import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Settings } from "./Settings";
import * as auth from "../../units/auth";

beforeEach(() => localStorage.clear());

test("Edit API key reveals the key only after a correct PIN", async () => {
  vi.spyOn(auth, "getAccount").mockReturnValue({ username: "charlie" } as any);
  vi.spyOn(auth, "verifyAccountPin").mockImplementation(async (p) => p === "1234");
  vi.spyOn(auth, "revealApiKey").mockResolvedValue("sk-secret");

  render(<Settings onBack={() => {}} onSignedOut={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /edit api key/i }));

  fireEvent.change(screen.getByLabelText(/enter pin/i), { target: { value: "0000" } });
  fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
  await waitFor(() => expect(screen.getByText(/incorrect pin/i)).toBeInTheDocument());
  expect(screen.queryByDisplayValue("sk-secret")).toBeNull();

  fireEvent.change(screen.getByLabelText(/enter pin/i), { target: { value: "1234" } });
  fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
  await waitFor(() => expect(screen.getByDisplayValue("sk-secret")).toBeInTheDocument());
});
