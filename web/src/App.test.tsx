import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import { meApi, type PublicAccount } from "./units/apiClient";
import { generateBackOfHead, GenerationRequestError } from "./units/generationClient";

vi.mock("./units/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./units/apiClient")>();
  return {
    ...actual,
    meApi: { get: vi.fn() },
  };
});

vi.mock("./units/generationClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./units/generationClient")>();
  return {
    ...actual,
    generateBackOfHead: vi.fn(),
  };
});

// jsdom has no camera hardware: stub startStream so <Camera> can mount without
// throwing (navigator.mediaDevices is undefined in jsdom).
vi.mock("./units/camera", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./units/camera")>();
  return {
    ...actual,
    startStream: vi.fn().mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream),
    stopStream: vi.fn(),
  };
});

// jsdom cannot execute canvas rendering (documented in imageUtil.ts); stub the
// downscale step so the generate pipeline can run end-to-end in tests.
vi.mock("./units/imageUtil", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./units/imageUtil")>();
  return {
    ...actual,
    downscaleImage: vi.fn().mockResolvedValue({ base64: "aW4=", mimeType: "image/jpeg", width: 10, height: 10 }),
  };
});

const originalCreateImageBitmap = (globalThis as any).createImageBitmap;

beforeEach(() => {
  localStorage.clear();
  // detectInput/detectOutput call createImageBitmap directly on the blob
  // before ever reaching detectFaces; jsdom does not implement it.
  (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({ width: 100, height: 100, close: () => {} });
  vi.mocked(meApi.get).mockReset();
  vi.mocked(generateBackOfHead).mockReset();
});

afterEach(() => {
  (globalThis as any).createImageBitmap = originalCreateImageBitmap;
});

function account(overrides: Partial<PublicAccount> = {}): PublicAccount {
  return {
    username: "alice",
    email: "alice@example.com",
    hasOwnKey: true,
    isDev: false,
    usesDevKey: false,
    ...overrides,
  };
}

async function renderCameraApp(acc: PublicAccount) {
  vi.mocked(meApi.get).mockResolvedValue(acc);
  const utils = render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: /your backs/i })).toBeInTheDocument());
  return utils;
}

function uploadPhoto(container: HTMLElement) {
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["photo-bytes"], "photo.jpg", { type: "image/jpeg" });
  fireEvent.change(fileInput, { target: { files: [file] } });
}

test("while meApi.get is pending, shows a loading state (no SignIn, AddKey, or camera app)", async () => {
  let resolveMe: (v: PublicAccount | null) => void = () => {};
  vi.mocked(meApi.get).mockReturnValue(
    new Promise((resolve) => {
      resolveMe = resolve;
    }),
  );
  render(<App />);

  expect(screen.queryByRole("button", { name: /send code/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /save key/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /your backs/i })).not.toBeInTheDocument();

  resolveMe(null);
  await waitFor(() => expect(screen.getByRole("button", { name: /send code/i })).toBeInTheDocument());
});

test("meApi.get resolving null renders SignIn", async () => {
  vi.mocked(meApi.get).mockResolvedValue(null);
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: /send code/i })).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /save key/i })).not.toBeInTheDocument();
});

test("meApi.get resolving an account with no own key and no dev key routes to AddKey", async () => {
  vi.mocked(meApi.get).mockResolvedValue(account({ hasOwnKey: false, usesDevKey: false }));
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: /save key/i })).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /send code/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /your backs/i })).not.toBeInTheDocument();
});

test("meApi.get resolving an account using the dev key renders the camera app, not AddKey", async () => {
  vi.mocked(meApi.get).mockResolvedValue(account({ hasOwnKey: false, usesDevKey: true }));
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: /your backs/i })).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /save key/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /send code/i })).not.toBeInTheDocument();
});

test("a generate call that throws daily_limit shows the daily-limit message and stays on the camera app", async () => {
  vi.mocked(generateBackOfHead).mockRejectedValue(
    new GenerationRequestError("daily_limit", "Daily limit reached. Try again tomorrow."),
  );
  const { container } = await renderCameraApp(account());

  uploadPhoto(container);

  expect(await screen.findByText("Daily limit reached. Try again tomorrow.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /your backs/i })).toBeInTheDocument();
});

test("a generate call that throws no_key refreshes the account and routes to AddKey", async () => {
  vi.mocked(meApi.get)
    .mockResolvedValueOnce(account({ hasOwnKey: true }))
    .mockResolvedValueOnce(account({ hasOwnKey: false, usesDevKey: false }));
  vi.mocked(generateBackOfHead).mockRejectedValue(
    new GenerationRequestError("no_key", "Add your Gemini key first."),
  );

  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: /your backs/i })).toBeInTheDocument());
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["photo-bytes"], "photo.jpg", { type: "image/jpeg" });
  fireEvent.change(fileInput, { target: { files: [file] } });

  await waitFor(() => expect(screen.getByRole("button", { name: /save key/i })).toBeInTheDocument());
  expect(meApi.get).toHaveBeenCalledTimes(2);
});

test("a generate call that throws unauthorized signs the user out to SignIn", async () => {
  vi.mocked(generateBackOfHead).mockRejectedValue(
    new GenerationRequestError("unauthorized", "Sign in required."),
  );
  const { container } = await renderCameraApp(account());

  uploadPhoto(container);

  await waitFor(() => expect(screen.getByRole("button", { name: /send code/i })).toBeInTheDocument());
});
