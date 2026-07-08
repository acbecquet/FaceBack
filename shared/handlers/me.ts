import type { Env } from "../env";
import { json, errorResponse } from "../http";
import { getAuthedAccount, accountSummary } from "../auth/requestAuth";

export async function handleMe(req: Request, env: Env): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  return json(await accountSummary(env, account));
}
