import type { Env } from "../env";
import { getAccountById, type Account } from "../data/accounts";
import { isAllowlisted } from "../data/allowlist";
import { SESSION_COOKIE_NAME, verifySession } from "./session";

export interface PublicAccount {
  username: string;
  email: string;
  hasOwnKey: boolean;
  isDev: boolean;
  usesDevKey: boolean;
}

export function getSessionToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.headers.get("Cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) return part.slice(eq + 1).trim();
  }
  return null;
}

export async function getAuthedAccount(req: Request, env: Env): Promise<Account | null> {
  const token = getSessionToken(req);
  if (!token) return null;
  const accountId = await verifySession(token, env.SESSION_SECRET, Date.now());
  if (!accountId) return null;
  return getAccountById(env, accountId);
}

export async function accountSummary(env: Env, account: Account): Promise<PublicAccount> {
  const usesDevKey = account.isDev || (await isAllowlisted(env, account.email));
  return {
    username: account.username,
    email: account.email,
    hasOwnKey: account.hasKey,
    isDev: account.isDev,
    usesDevKey,
  };
}
