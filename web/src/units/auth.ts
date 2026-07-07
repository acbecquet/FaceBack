import type { Account, WrappedKeyRecord } from "../types";
import {
  hashPin,
  verifyPin,
  wrapApiKey,
  unwrapApiKey,
  type WrappingKeyStore,
} from "./keystore";

const ACCOUNT_KEY = "faceback.account";
const WRAPPED_KEY = "faceback.wrappedKey";

export async function createAccount(
  input: { username: string; email: string; apiKey: string; pin: string },
  store: WrappingKeyStore,
): Promise<Account> {
  const { hash, salt } = await hashPin(input.pin);
  const wrapped = await wrapApiKey(store, input.apiKey);
  const account: Account = {
    username: input.username,
    email: input.email,
    pinHash: hash,
    pinSalt: salt,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  localStorage.setItem(WRAPPED_KEY, JSON.stringify(wrapped));
  return account;
}

export function getAccount(): Account | null {
  const raw = localStorage.getItem(ACCOUNT_KEY);
  return raw ? (JSON.parse(raw) as Account) : null;
}

export function isSignedIn(): boolean {
  return getAccount() !== null;
}

export function signOut(): void {
  localStorage.removeItem(ACCOUNT_KEY);
  localStorage.removeItem(WRAPPED_KEY);
}

export async function verifyAccountPin(pin: string): Promise<boolean> {
  const account = getAccount();
  if (!account) return false;
  return verifyPin(pin, account.pinHash, account.pinSalt);
}

function getWrappedKey(): WrappedKeyRecord {
  const raw = localStorage.getItem(WRAPPED_KEY);
  if (!raw) throw new Error("No wrapped key stored");
  return JSON.parse(raw) as WrappedKeyRecord;
}

export async function revealApiKey(store: WrappingKeyStore): Promise<string> {
  return unwrapApiKey(store, getWrappedKey());
}
