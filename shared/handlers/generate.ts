import type { Env } from "../env";
import { json, errorResponse } from "../http";
import { getAuthedAccount } from "../auth/requestAuth";
import { isAllowlisted } from "../data/allowlist";
import { getUsage, incrementUsage, overCap } from "../data/usage";
import { getAccountKeyCipher, DEV_ACCOUNT_ID } from "../data/accounts";
import { decryptApiKey } from "../crypto/keyCipher";
import { BACK_OF_HEAD_PROMPT } from "../prompt";
import { GeminiError, type GeminiClient, type GeneratedImage } from "../gemini";

const MIN_IMAGE_BASE64 = 100;
const isPlausible = (img: GeneratedImage): boolean =>
  typeof img.imageBase64 === "string" && img.imageBase64.length >= MIN_IMAGE_BASE64;

export async function handleGenerate(
  req: Request,
  env: Env,
  deps: { makeClient: (apiKey: string) => GeminiClient },
): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);

  const body = (await req.json().catch(() => null)) as { image?: { base64?: unknown; mimeType?: unknown } } | null;
  const image = body?.image;
  if (typeof image?.base64 !== "string" || !image.base64 || typeof image?.mimeType !== "string" || !image.mimeType) {
    return errorResponse("bad_input", "Expected { image: { base64, mimeType } }", 400);
  }

  const now = Date.now();
  const usesDevKey = account.isDev || (await isAllowlisted(env, account.email));
  let apiKey: string;
  if (usesDevKey) {
    if (overCap(await getUsage(env, account.email, now), account.isDev))
      return errorResponse("daily_limit", "Daily limit reached. Try again tomorrow.", 429);
    const cipher = await getAccountKeyCipher(env, DEV_ACCOUNT_ID);
    if (!cipher) return errorResponse("dev_key_unset", "The shared key is not configured yet.", 503);
    apiKey = await decryptApiKey(cipher.ciphertext, cipher.iv, env.KEY_ENC_SECRET);
  } else {
    const cipher = await getAccountKeyCipher(env, account.id);
    if (!cipher) return errorResponse("no_key", "Add your Gemini key first.", 400);
    apiKey = await decryptApiKey(cipher.ciphertext, cipher.iv, env.KEY_ENC_SECRET);
  }

  const client = deps.makeClient(apiKey);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await client.generateImage(BACK_OF_HEAD_PROMPT, { base64: image.base64, mimeType: image.mimeType });
      if (isPlausible(out)) {
        if (usesDevKey) await incrementUsage(env, account.email, now);
        return json({ image: { base64: out.imageBase64, mimeType: out.mimeType } });
      }
    }
    return errorResponse("generation_failed", "Could not produce a valid image.", 502);
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse("gemini_error", err.message, err.status === 429 ? 429 : 502);
    return errorResponse("internal_error", "Unexpected error.", 500);
  }
}
