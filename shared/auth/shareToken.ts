import { signToken, verifyToken } from "../tokens";

// A share link lets anyone who opens it become the account that created it,
// for a bounded window. The link (and the session it grants) both expire one
// hour after creation - the redeemed session is pinned to the token's own
// expiry, so all borrowed access ends at the same instant no matter when the
// link is opened.
export const SHARE_TTL_SECONDS = 60 * 60; // 1 hour

export async function signShareToken(accountId: string, secret: string, nowMs: number): Promise<string> {
  return signToken(secret, { sub: accountId, typ: "share" }, SHARE_TTL_SECONDS, nowMs);
}

// Returns the target account id and the token's absolute expiry (ms since
// epoch) when the token is valid, otherwise null.
export async function verifyShareToken(
  token: string,
  secret: string,
  nowMs: number,
): Promise<{ sub: string; expMs: number } | null> {
  const payload = await verifyToken(secret, token, nowMs);
  if (!payload) return null;
  if (payload.typ !== "share") return null;
  if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
  return { sub: payload.sub, expMs: payload.exp };
}
