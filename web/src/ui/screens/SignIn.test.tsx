import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { SignIn } from "./SignIn";
import { authApi, ApiError, type PublicAccount } from "../../units/apiClient";

vi.mock("../../units/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../units/apiClient")>();
  return {
    ...actual,
    authApi: {
      request: vi.fn(),
      verify: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
    },
  };
});

const account: PublicAccount = {
  username: "alice",
  email: "alice@example.com",
  hasOwnKey: true,
  isDev: false,
  usesDevKey: false,
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(authApi.request).mockReset();
  vi.mocked(authApi.verify).mockReset();
  vi.mocked(authApi.signup).mockReset();
});

test("sign in: entering an email and Send code calls authApi.request with the identifier", async () => {
  vi.mocked(authApi.request).mockResolvedValue({ pending: true });
  render(<SignIn onSignedIn={vi.fn()} />);

  fireEvent.change(screen.getByLabelText("Email or username"), {
    target: { value: "alice@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /send code/i }));

  await waitFor(() =>
    expect(authApi.request).toHaveBeenCalledWith({ identifier: "alice@example.com" }),
  );
  expect(await screen.findByLabelText(/verification code/i)).toBeInTheDocument();
});

test("sign in: entering the code and Verify calls authApi.verify and fires onSignedIn with the account", async () => {
  vi.mocked(authApi.request).mockResolvedValue({ pending: true });
  vi.mocked(authApi.verify).mockResolvedValue({ account });
  const onSignedIn = vi.fn();
  render(<SignIn onSignedIn={onSignedIn} />);

  fireEvent.change(screen.getByLabelText("Email or username"), {
    target: { value: "alice@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /send code/i }));
  await screen.findByLabelText(/verification code/i);

  fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: /verify/i }));

  await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(account));
  expect(authApi.verify).toHaveBeenCalledWith({ identifier: "alice@example.com", code: "123456" });
});

test("create account: toggle reveals username + email, and Send code calls authApi.signup", async () => {
  vi.mocked(authApi.signup).mockResolvedValue({ pending: true });
  render(<SignIn onSignedIn={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /create an account/i }));

  expect(screen.getByLabelText("Username")).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "bob" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bob@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: /send code/i }));

  await waitFor(() =>
    expect(authApi.signup).toHaveBeenCalledWith({ username: "bob", email: "bob@example.com" }),
  );
  expect(await screen.findByLabelText(/verification code/i)).toBeInTheDocument();
});

test("create account: verify posts the email as identifier and fires onSignedIn", async () => {
  vi.mocked(authApi.signup).mockResolvedValue({ pending: true });
  vi.mocked(authApi.verify).mockResolvedValue({ account });
  const onSignedIn = vi.fn();
  render(<SignIn onSignedIn={onSignedIn} />);

  fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "bob" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bob@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: /send code/i }));
  await screen.findByLabelText(/verification code/i);

  fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "654321" } });
  fireEvent.click(screen.getByRole("button", { name: /verify/i }));

  await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(account));
  expect(authApi.verify).toHaveBeenCalledWith({ identifier: "bob@example.com", code: "654321" });
});

test("a no_account error on sign-in shows a message and a create-account link", async () => {
  vi.mocked(authApi.request).mockRejectedValue(
    new ApiError("no_account", "No account found. Sign up first."),
  );
  render(<SignIn onSignedIn={vi.fn()} />);

  fireEvent.change(screen.getByLabelText("Email or username"), {
    target: { value: "nope@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /send code/i }));

  expect(
    await screen.findByText(/no account with that email or username/i),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create an account/i })).toBeInTheDocument();
});

test("shows the ApiError message on a rate-limited response and disables the button while busy", async () => {
  let resolveRequest: (v: { pending: boolean }) => void = () => {};
  vi.mocked(authApi.request).mockReturnValue(
    new Promise((resolve) => {
      resolveRequest = resolve;
    }),
  );
  render(<SignIn onSignedIn={vi.fn()} />);

  fireEvent.change(screen.getByLabelText("Email or username"), {
    target: { value: "alice@example.com" },
  });
  const sendButton = screen.getByRole("button", { name: /send code/i });
  fireEvent.click(sendButton);

  await waitFor(() => expect(sendButton).toBeDisabled());
  resolveRequest({ pending: true });
  await screen.findByLabelText(/verification code/i);

  vi.mocked(authApi.verify).mockRejectedValue(
    new ApiError("rate_limited", "Too many attempts. Try again later."),
  );
  fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: /verify/i }));

  expect(await screen.findByText("Too many attempts. Try again later.")).toBeInTheDocument();
});

test("has no PIN input and no API key input", () => {
  render(<SignIn onSignedIn={vi.fn()} />);
  expect(screen.queryByLabelText(/pin/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/key/i)).not.toBeInTheDocument();
});
