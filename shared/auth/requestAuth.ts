import type { Env } from "../env";
import type { Account } from "../data/accounts";
import { isAllowlisted } from "../data/allowlist";
import { SESSION_COOKIE_NAME } from "./session";

export interface PublicAccount {
  username: string;
  email: string;
  hasKey: boolean;
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

export async function accountSummary(env: Env, account: Account): Promise<PublicAccount> {
  const usesDevKey = account.isDev || (await isAllowlisted(env, account.email));
  return {
    username: account.username,
    email: account.email,
    hasKey: account.hasKey,
    isDev: account.isDev,
    usesDevKey,
  };
}
