import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import { checkRateLimit } from "../../data/ratelimit";
import { signShareToken, SHARE_TTL_SECONDS } from "../../auth/shareToken";

// Dev-only: mint a one-hour link that signs whoever opens it into the caller's
// account. Only the dev/owner account may create these.
export async function handleCreateShareLink(req: Request, env: Env): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  if (!account.isDev) return errorResponse("forbidden", "Not allowed.", 403);

  const now = Date.now();
  if (!(await checkRateLimit(env, "share", account.email, 10, 3600, now)))
    return errorResponse("rate_limited", "Too many links created. Try again later.", 429);

  const token = await signShareToken(account.id, env.SESSION_SECRET, now);
  const url = `${new URL(req.url).origin}/r?t=${encodeURIComponent(token)}`;
  return json({ url, expiresInSeconds: SHARE_TTL_SECONDS });
}
