import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AddKey } from "./AddKey";
import { keyApi, ApiError } from "../../units/apiClient";

vi.mock("../../units/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../units/apiClient")>();
  return {
    ...actual,
    keyApi: {
      setInitial: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.mocked(keyApi.setInitial).mockReset();
});

test("Save is disabled until a key is entered", () => {
  render(<AddKey onDone={vi.fn()} />);
  expect(screen.getByRole("button", { name: /save key/i })).toBeDisabled();
});

test("entering a key and Save calls keyApi.setInitial with the key, then onDone", async () => {
  vi.mocked(keyApi.setInitial).mockResolvedValue({ ok: true });
  const onDone = vi.fn();
  render(<AddKey onDone={onDone} />);

  fireEvent.change(screen.getByLabelText(/nano banana 2 key/i), {
    target: { value: "sk-test-123" },
  });
  fireEvent.click(screen.getByRole("button", { name: /save key/i }));

  await waitFor(() => expect(keyApi.setInitial).toHaveBeenCalledWith({ apiKey: "sk-test-123" }));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
});

test("shows the ApiError message on failure and disables Save while busy", async () => {
  let rejectSave: (e: unknown) => void = () => {};
  vi.mocked(keyApi.setInitial).mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectSave = reject;
    }),
  );
  const onDone = vi.fn();
  render(<AddKey onDone={onDone} />);

  fireEvent.change(screen.getByLabelText(/nano banana 2 key/i), {
    target: { value: "sk-test-123" },
  });
  const saveButton = screen.getByRole("button", { name: /save key/i });
  fireEvent.click(saveButton);

  await waitFor(() => expect(saveButton).toBeDisabled());
  rejectSave(new ApiError("bad_input", "Key looks invalid."));

  expect(await screen.findByText("Key looks invalid.")).toBeInTheDocument();
  expect(saveButton).not.toBeDisabled();
  expect(onDone).not.toHaveBeenCalled();
});

test("has no PIN input", () => {
  render(<AddKey onDone={vi.fn()} />);
  expect(screen.queryByLabelText(/pin/i)).not.toBeInTheDocument();
});
