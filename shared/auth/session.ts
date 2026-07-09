import { signToken, verifyToken } from "../tokens";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const COOKIE = "fb_session";

export async function signSession(accountId: string, secret: string, nowMs: number): Promise<string> {
  return signToken(secret, { sub: accountId, typ: "session" }, ONE_YEAR_SECONDS, nowMs);
}

export async function verifySession(token: string, secret: string, nowMs: number): Promise<string | null> {
  const payload = await verifyToken(secret, token, nowMs);
  if (!payload) return null;
  if (payload.typ !== "session") return null;
  return typeof payload.sub === "string" ? payload.sub : null;
}

export function sessionCookie(token: string, maxAgeSeconds: number = ONE_YEAR_SECONDS): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export const SESSION_COOKIE_NAME = COOKIE;
