import { signToken, verifyToken } from "../tokens";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const COOKIE = "fb_session";

export async function signSession(accountId: string, secret: string, nowMs: number): Promise<string> {
  return signToken(secret, { sub: accountId }, ONE_YEAR_SECONDS, nowMs);
}

export async function verifySession(token: string, secret: string, nowMs: number): Promise<string | null> {
  const payload = await verifyToken(secret, token, nowMs);
  if (!payload) return null;
  return typeof payload.sub === "string" ? payload.sub : null;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ONE_YEAR_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export const SESSION_COOKIE_NAME = COOKIE;
