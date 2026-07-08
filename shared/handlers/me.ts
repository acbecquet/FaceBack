import type { Env } from "../env";
import { json, errorResponse } from "../http";
import { getSessionToken, accountSummary } from "../auth/requestAuth";
import { verifySession } from "../auth/session";
import { getAccountById } from "../data/accounts";

export async function handleMe(req: Request, env: Env): Promise<Response> {
  const token = getSessionToken(req);
  if (!token) return errorResponse("unauthorized", "Sign in required.", 401);
  const accountId = await verifySession(token, env.SESSION_SECRET, Date.now());
  if (!accountId) return errorResponse("unauthorized", "Sign in required.", 401);
  const account = await getAccountById(env, accountId);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  return json(await accountSummary(env, account));
}
