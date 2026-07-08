import { afterEach, beforeEach, expect, test } from "vitest";
import {
  createAccount,
  getAccount,
  isSignedIn,
  signOut,
  verifyAccountPin,
  revealApiKey,
  resetPin,
  hasStoredKey,
} from "./auth";
import { createMemoryWrappingKeyStore } from "./keystore";

beforeEach(() => localStorage.clear());

afterEach(
  () =>
    new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("faceback");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    }),
);

const input = {
  username: "charlie",
  email: "charlie@example.com",
  apiKey: "AIzaSy-fake-key",
  pin: "1234",
};

test("createAccount persists the account and signs the user in", async () => {
  expect(isSignedIn()).toBe(false);
  const account = await createAccount(input, createMemoryWrappingKeyStore());
  expect(account.username).toBe("charlie");
  expect(account.email).toBe("charlie@example.com");
  expect(getAccount()?.username).toBe("charlie");
  expect(isSignedIn()).toBe(true);
});

test("the raw PIN and API key are never stored in plaintext", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  const dump = JSON.stringify(localStorage);
  expect(dump).not.toContain("1234");
  expect(dump).not.toContain("AIzaSy-fake-key");
});

test("createAccount stores the wrapped key in IndexedDB and hasStoredKey is true", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  expect(localStorage.getItem("faceback.wrappedKey")).toBeNull(); // no longer in localStorage
  await expect(hasStoredKey()).resolves.toBe(true);
});

test("verifyAccountPin accepts the right PIN and rejects the wrong one", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  await expect(verifyAccountPin("1234")).resolves.toBe(true);
  await expect(verifyAccountPin("9999")).resolves.toBe(false);
});

test("revealApiKey returns the decrypted key using the same store", async () => {
  const store = createMemoryWrappingKeyStore();
  await createAccount(input, store);
  await expect(revealApiKey(store)).resolves.toBe("AIzaSy-fake-key");
});

test("signOut clears the account", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  await signOut();
  expect(getAccount()).toBeNull();
  expect(isSignedIn()).toBe(false);
});

test("signOut clears the account and the stored key", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  await signOut();
  expect(getAccount()).toBeNull();
  await expect(hasStoredKey()).resolves.toBe(false);
});

test("resetPin changes the stored PIN so the new PIN verifies and the old one does not", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  await resetPin("9999", "reset-token");
  await expect(verifyAccountPin("9999")).resolves.toBe(true);
  await expect(verifyAccountPin("1234")).resolves.toBe(false);
});

test("resetPin refuses without a reset token", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  await expect(resetPin("9999", "")).rejects.toThrow();
});
