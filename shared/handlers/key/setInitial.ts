import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import { getAccountKeyCipher, setAccountKey } from "../../data/accounts";
import { encryptApiKey } from "../../crypto/keyCipher";

export async function handleSetInitialKey(req: Request, env: Env): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  const body = (await req.json().catch(() => null)) as { apiKey?: unknown } | null;
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) return errorResponse("bad_input", "An API key is required.", 400);
  if (await getAccountKeyCipher(env, account.id))
    return errorResponse("key_exists", "A key is already set. Use edit instead.", 409);
  const { ciphertext, iv } = await encryptApiKey(apiKey, env.KEY_ENC_SECRET);
  await setAccountKey(env, account.id, ciphertext, iv);
  return json({ ok: true });
}
