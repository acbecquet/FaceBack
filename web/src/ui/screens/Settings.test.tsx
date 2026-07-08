import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Settings } from "./Settings";
import { keyApi, allowlistApi, type PublicAccount } from "../../units/apiClient";

vi.mock("../../units/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../units/apiClient")>();
  return {
    ...actual,
    keyApi: {
      setInitial: vi.fn(),
      challenge: vi.fn(),
      reveal: vi.fn(),
      edit: vi.fn(),
    },
    allowlistApi: {
      list: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
    },
  };
});

function makeAccount(overrides: Partial<PublicAccount> = {}): PublicAccount {
  return {
    username: "charlie",
    email: "charlie@example.com",
    hasOwnKey: true,
    isDev: false,
    usesDevKey: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(keyApi.challenge).mockReset();
  vi.mocked(keyApi.reveal).mockReset();
  vi.mocked(keyApi.edit).mockReset();
  vi.mocked(allowlistApi.list).mockReset();
  vi.mocked(allowlistApi.add).mockReset();
  vi.mocked(allowlistApi.remove).mockReset();
});

test("normal own-key user: the key row calls challenge, then reveal, then Save calls edit with the editToken", async () => {
  vi.mocked(keyApi.challenge).mockResolvedValue({ pending: true });
  vi.mocked(keyApi.reveal).mockResolvedValue({ apiKey: "sk-secret", editToken: "tok-1" });
  vi.mocked(keyApi.edit).mockResolvedValue({ ok: true });

  render(<Settings account={makeAccount()} onBack={() => {}} onSignedOut={() => {}} />);

  expect(screen.getByText("@charlie")).toBeInTheDocument();
  expect(screen.getByText("charlie@example.com")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /view \/ edit api key/i }));
  await waitFor(() => expect(keyApi.challenge).toHaveBeenCalledTimes(1));

  const codeField = await screen.findByLabelText(/verification code/i);
  fireEvent.change(codeField, { target: { value: "654321" } });
  fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

  await waitFor(() => expect(keyApi.reveal).toHaveBeenCalledWith({ code: "654321" }));
  const keyField = await screen.findByDisplayValue("sk-secret");

  fireEvent.change(keyField, { target: { value: "sk-updated" } });
  fireEvent.click(screen.getByRole("button", { name: /save key/i }));

  await waitFor(() =>
    expect(keyApi.edit).toHaveBeenCalledWith({ apiKey: "sk-updated", editToken: "tok-1" }),
  );
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
});

test("friend (usesDevKey, not dev): no key field or controls render; shared-key row is shown", () => {
  render(
    <Settings
      account={makeAccount({ usesDevKey: true, hasOwnKey: false })}
      onBack={() => {}}
      onSignedOut={() => {}}
    />,
  );

  expect(screen.queryByRole("button", { name: /view \/ edit api key/i })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^api key$/i)).not.toBeInTheDocument();
  expect(screen.getByText(/using the shared faceback key/i)).toBeInTheDocument();
});

test("dev owner: allowlist renders from list, add and remove call the API and the list re-fetches", async () => {
  vi.mocked(allowlistApi.list)
    .mockResolvedValueOnce({ emails: ["friend@example.com"] })
    .mockResolvedValueOnce({ emails: ["friend@example.com", "new@example.com"] })
    .mockResolvedValueOnce({ emails: ["new@example.com"] });
  vi.mocked(allowlistApi.add).mockResolvedValue({ ok: true });
  vi.mocked(allowlistApi.remove).mockResolvedValue({ ok: true });

  render(
    <Settings
      account={makeAccount({ isDev: true, usesDevKey: true, hasOwnKey: false })}
      onBack={() => {}}
      onSignedOut={() => {}}
    />,
  );

  expect(await screen.findByText("friend@example.com")).toBeInTheDocument();
  // the dev owner manages the shared key too
  expect(screen.getByRole("button", { name: /view \/ edit api key/i })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/add email/i), { target: { value: "new@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await waitFor(() => expect(allowlistApi.add).toHaveBeenCalledWith("new@example.com"));
  expect(await screen.findByText("new@example.com")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /remove friend@example\.com/i }));

  await waitFor(() => expect(allowlistApi.remove).toHaveBeenCalledWith("friend@example.com"));
  await waitFor(() => expect(screen.queryByText("friend@example.com")).not.toBeInTheDocument());
  expect(screen.getByText("new@example.com")).toBeInTheDocument();
});

test("non-dev user sees no allowlist section", () => {
  render(<Settings account={makeAccount()} onBack={() => {}} onSignedOut={() => {}} />);

  expect(screen.queryByText(/manage invites/i)).not.toBeInTheDocument();
  expect(allowlistApi.list).not.toHaveBeenCalled();
});

test("sign out calls onSignedOut", () => {
  const onSignedOut = vi.fn();
  render(<Settings account={makeAccount()} onBack={() => {}} onSignedOut={onSignedOut} />);

  fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

  expect(onSignedOut).toHaveBeenCalledTimes(1);
});

test("shows the ApiError message when the code is wrong, and never reveals a key field", async () => {
  vi.mocked(keyApi.challenge).mockResolvedValue({ pending: true });
  vi.mocked(keyApi.reveal).mockRejectedValue(new (await import("../../units/apiClient")).ApiError("bad_code", "Incorrect code."));

  render(<Settings account={makeAccount()} onBack={() => {}} onSignedOut={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: /view \/ edit api key/i }));
  const codeField = await screen.findByLabelText(/verification code/i);
  fireEvent.change(codeField, { target: { value: "000000" } });
  fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

  expect(await screen.findByText("Incorrect code.")).toBeInTheDocument();
  expect(screen.queryByLabelText(/^api key$/i)).not.toBeInTheDocument();
});

test("Cancel closes the code modal without revealing the key", async () => {
  vi.mocked(keyApi.challenge).mockResolvedValue({ pending: true });

  render(<Settings account={makeAccount()} onBack={() => {}} onSignedOut={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: /view \/ edit api key/i }));
  await screen.findByLabelText(/verification code/i);
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

  expect(screen.queryByLabelText(/verification code/i)).not.toBeInTheDocument();
  expect(keyApi.reveal).not.toHaveBeenCalled();
});

test("has no PIN input anywhere", () => {
  render(<Settings account={makeAccount()} onBack={() => {}} onSignedOut={() => {}} />);
  expect(screen.queryByLabelText(/pin/i)).not.toBeInTheDocument();
});
