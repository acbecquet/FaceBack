import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { validateSignup } from "./validate";
import { checkRateLimit } from "../../data/ratelimit";
import { createAccount, getAccountByIdentifier, DuplicateAccountError } from "../../data/accounts";
import { issueCode } from "../../auth/codeStore";
import { emailSendErrorResponse, type EmailProvider } from "../../email";

export async function handleSignup(req: Request, env: Env, email: EmailProvider): Promise<Response> {
  const parsed = validateSignup(await req.json().catch(() => null));
  if ("error" in parsed) return errorResponse("bad_input", parsed.error, 400);
  const now = Date.now();
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await checkRateLimit(env, "email", parsed.email, 5, 3600, now)))
    return errorResponse("rate_limited", "Too many attempts. Try again later.", 429);
  if (!(await checkRateLimit(env, "ip", ip, 20, 3600, now)))
    return errorResponse("rate_limited", "Too many attempts. Try again later.", 429);

  const byEmail = await getAccountByIdentifier(env, parsed.email);
  if (byEmail) {
    if (byEmail.emailVerified)
      return errorResponse("account_exists", "That email is already registered. Sign in instead.", 409);
    const code = await issueCode(env, "auth", byEmail.email);
    try {
      await email.sendCode({ to: byEmail.email, code, purpose: "auth" });
    } catch (e) {
      return emailSendErrorResponse(e);
    }
    return json({ pending: true });
  }
  if (await getAccountByIdentifier(env, parsed.username))
    return errorResponse("username_taken", "That username is taken.", 409);

  let account;
  try {
    account = await createAccount(env, { username: parsed.username, email: parsed.email });
  } catch (e) {
    if (e instanceof DuplicateAccountError)
      return errorResponse("account_exists", "That username or email is taken.", 409);
    throw e;
  }
  const code = await issueCode(env, "auth", account.email);
  try {
    await email.sendCode({ to: account.email, code, purpose: "auth" });
  } catch (e) {
    return emailSendErrorResponse(e);
  }
  return json({ pending: true });
}
