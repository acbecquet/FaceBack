import { signToken, verifyToken } from "../tokens";

const KEY_EDIT_TTL_SECONDS = 5 * 60;

export async function signKeyToken(accountId: string, secret: string, nowMs: number): Promise<string> {
  return signToken(secret, { sub: accountId, typ: "key-edit" }, KEY_EDIT_TTL_SECONDS, nowMs);
}

export async function verifyKeyToken(token: string, secret: string, nowMs: number): Promise<string | null> {
  const payload = await verifyToken(secret, token, nowMs);
  if (!payload) return null;
  if (payload.typ !== "key-edit") return null;
  return typeof payload.sub === "string" ? payload.sub : null;
}
