import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import { issueCode } from "../../auth/codeStore";
import { checkRateLimit } from "../../data/ratelimit";
import { emailSendErrorResponse, type EmailProvider } from "../../email";

export async function handleKeyChallenge(req: Request, env: Env, email: EmailProvider): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  const now = Date.now();
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await checkRateLimit(env, "email", account.email, 5, 3600, now)))
    return errorResponse("rate_limited", "Too many attempts. Try again later.", 429);
  if (!(await checkRateLimit(env, "ip", ip, 20, 3600, now)))
    return errorResponse("rate_limited", "Too many attempts. Try again later.", 429);
  const code = await issueCode(env, "key", account.email);
  try {
    await email.sendCode({ to: account.email, code, purpose: "key" });
  } catch (e) {
    return emailSendErrorResponse(e);
  }
  return json({ pending: true });
}
