import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { SignIn } from "./SignIn";
import * as auth from "../../units/auth";

beforeEach(() => localStorage.clear());

test("Create is disabled until the form is valid, then calls createAccount and onCreated", async () => {
  const spy = vi.spyOn(auth, "createAccount").mockResolvedValue({} as any);
  const onCreated = vi.fn();
  render(<SignIn onCreated={onCreated} />);

  const create = screen.getByRole("button", { name: /create account/i });
  expect(create).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "charlie" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "c@e.com" } });
  fireEvent.change(screen.getByLabelText("Nano Banana 2 key"), { target: { value: "sk-123" } });
  fireEvent.change(screen.getByLabelText("Set a 4-digit PIN"), { target: { value: "1234" } });
  fireEvent.change(screen.getByLabelText("Confirm PIN"), { target: { value: "1234" } });

  expect(create).toBeEnabled();
  fireEvent.click(create);
  await waitFor(() => expect(onCreated).toHaveBeenCalled());
  expect(spy).toHaveBeenCalledWith(
    { username: "charlie", email: "c@e.com", apiKey: "sk-123", pin: "1234" },
    expect.anything(),
  );
  spy.mockRestore();
});
