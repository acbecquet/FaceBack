import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import { verifyStoredCode } from "../../auth/codeStore";
import { getAccountKeyCipher } from "../../data/accounts";
import { decryptApiKey } from "../../crypto/keyCipher";
import { signKeyToken } from "../../auth/keyToken";

export async function handleKeyReveal(req: Request, env: Env): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return errorResponse("bad_input", "Code is required.", 400);
  if (!(await verifyStoredCode(env, "key", account.email, code)))
    return errorResponse("bad_code", "Invalid or expired code.", 401);
  const cipher = await getAccountKeyCipher(env, account.id);
  const apiKey = cipher ? await decryptApiKey(cipher.ciphertext, cipher.iv, env.KEY_ENC_SECRET) : null;
  const editToken = await signKeyToken(account.id, env.SESSION_SECRET, Date.now());
  return json({ apiKey, editToken });
}
