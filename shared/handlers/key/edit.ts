import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import { verifyKeyToken } from "../../auth/keyToken";
import { encryptApiKey } from "../../crypto/keyCipher";
import { setAccountKey } from "../../data/accounts";

export async function handleKeyEdit(req: Request, env: Env): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  const body = (await req.json().catch(() => null)) as { apiKey?: unknown; editToken?: unknown } | null;
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  const editToken = typeof body?.editToken === "string" ? body.editToken : "";
  if (!apiKey) return errorResponse("bad_input", "An API key is required.", 400);
  const authedId = editToken ? await verifyKeyToken(editToken, env.SESSION_SECRET, Date.now()) : null;
  if (authedId !== account.id)
    return errorResponse("unauthorized", "A fresh key-edit authorization is required.", 401);
  const { ciphertext, iv } = await encryptApiKey(apiKey, env.KEY_ENC_SECRET);
  await setAccountKey(env, account.id, ciphertext, iv);
  return json({ ok: true });
}
