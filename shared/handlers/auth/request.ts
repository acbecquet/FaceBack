import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { validateIdentifier } from "./validate";
import { checkRateLimit } from "../../data/ratelimit";
import { getAccountByIdentifier } from "../../data/accounts";
import { issueCode } from "../../auth/codeStore";
import type { EmailProvider } from "../../email";

export async function handleRequest(req: Request, env: Env, email: EmailProvider): Promise<Response> {
  const identifier = validateIdentifier(await req.json().catch(() => null));
  if (!identifier) return errorResponse("bad_input", "An email or username is required.", 400);
  const now = Date.now();
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await checkRateLimit(env, "email", identifier, 5, 3600, now)))
    return errorResponse("rate_limited", "Too many attempts. Try again later.", 429);
  if (!(await checkRateLimit(env, "ip", ip, 20, 3600, now)))
    return errorResponse("rate_limited", "Too many attempts. Try again later.", 429);

  const account = await getAccountByIdentifier(env, identifier);
  if (!account) return errorResponse("no_account", "No account found. Sign up first.", 404);
  const code = await issueCode(env, "auth", account.email);
  await email.sendCode({ to: account.email, code, purpose: "auth" });
  return json({ pending: true });
}
