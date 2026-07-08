import type { Account } from "../types";
import {
  hashPin,
  verifyPin,
  wrapApiKey,
  unwrapApiKey,
  type WrappingKeyStore,
} from "./keystore";
import { getWrappedRecord, setWrappedRecord, clearKeystore } from "./indexeddb";

const ACCOUNT_KEY = "faceback.account";

export async function createAccount(
  input: { username: string; email: string; apiKey: string; pin: string },
  store: WrappingKeyStore,
): Promise<Account> {
  const { hash, salt } = await hashPin(input.pin);
  const wrapped = await wrapApiKey(store, input.apiKey);
  await setWrappedRecord(wrapped); // persist the key first
  const account: Account = {
    username: input.username,
    email: input.email,
    pinHash: hash,
    pinSalt: salt,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  return account;
}

export function getAccount(): Account | null {
  const raw = localStorage.getItem(ACCOUNT_KEY);
  return raw ? (JSON.parse(raw) as Account) : null;
}

export function isSignedIn(): boolean {
  return getAccount() !== null;
}

export async function hasStoredKey(): Promise<boolean> {
  return (await getWrappedRecord()) !== null;
}

export async function signOut(): Promise<void> {
  localStorage.removeItem(ACCOUNT_KEY);
  await clearKeystore();
}

export async function verifyAccountPin(pin: string): Promise<boolean> {
  const account = getAccount();
  if (!account) return false;
  return verifyPin(pin, account.pinHash, account.pinSalt);
}

export async function revealApiKey(store: WrappingKeyStore): Promise<string> {
  const rec = await getWrappedRecord();
  if (!rec) throw new Error("No stored key");
  return unwrapApiKey(store, rec);
}

export async function resetPin(newPin: string, resetToken: string): Promise<void> {
  if (!resetToken) throw new Error("A valid reset token is required");
  const account = getAccount();
  if (!account) throw new Error("No account to reset");
  const { hash, salt } = await hashPin(newPin);
  const updated: Account = { ...account, pinHash: hash, pinSalt: salt };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(updated));
}
