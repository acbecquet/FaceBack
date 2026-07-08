import type { Env } from "../env";

export interface Account {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  hasKey: boolean;
  isDev: boolean;
}

export class DuplicateAccountError extends Error {
  constructor() {
    super("username or email already exists");
    this.name = "DuplicateAccountError";
  }
}

export function newId(): string {
  return "acc_" + crypto.randomUUID();
}

const norm = (s: string) => s.trim().toLowerCase();

interface Row {
  id: string; username: string; email: string;
  email_verified: number; key_ciphertext: string | null; key_iv: string | null; is_dev: number;
}
const toAccount = (r: Row): Account => ({
  id: r.id, username: r.username, email: r.email,
  emailVerified: r.email_verified === 1, hasKey: r.key_ciphertext != null, isDev: r.is_dev === 1,
});

export async function createAccount(
  env: Env, input: { username: string; email: string; isDev?: boolean },
): Promise<Account> {
  const id = newId();
  const username = norm(input.username);
  const email = norm(input.email);
  try {
    await env.DB.prepare(
      "INSERT INTO accounts (id, username, email, email_verified, is_dev, created_at) VALUES (?, ?, ?, 0, ?, ?)",
    ).bind(id, username, email, input.isDev ? 1 : 0, new Date().toISOString()).run();
  } catch (e) {
    if (String((e as Error).message).includes("UNIQUE")) throw new DuplicateAccountError();
    throw e;
  }
  return { id, username, email, emailVerified: false, hasKey: false, isDev: !!input.isDev };
}

export async function getAccountByIdentifier(env: Env, identifier: string): Promise<Account | null> {
  const value = norm(identifier);
  const col = value.includes("@") ? "email" : "username";
  const row = await env.DB.prepare(`SELECT * FROM accounts WHERE ${col} = ?`).bind(value).first<Row>();
  return row ? toAccount(row) : null;
}

export async function getAccountById(env: Env, id: string): Promise<Account | null> {
  const row = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<Row>();
  return row ? toAccount(row) : null;
}

export async function markEmailVerified(env: Env, id: string): Promise<void> {
  await env.DB.prepare("UPDATE accounts SET email_verified = 1 WHERE id = ?").bind(id).run();
}

export async function setAccountKey(env: Env, id: string, ciphertext: string, iv: string): Promise<void> {
  await env.DB.prepare("UPDATE accounts SET key_ciphertext = ?, key_iv = ? WHERE id = ?")
    .bind(ciphertext, iv, id).run();
}

export async function getAccountKeyCipher(env: Env, id: string): Promise<{ ciphertext: string; iv: string } | null> {
  const row = await env.DB.prepare("SELECT key_ciphertext, key_iv FROM accounts WHERE id = ?")
    .bind(id).first<{ key_ciphertext: string | null; key_iv: string | null }>();
  if (!row || row.key_ciphertext == null || row.key_iv == null) return null;
  return { ciphertext: row.key_ciphertext, iv: row.key_iv };
}
