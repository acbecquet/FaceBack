import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import { issueCode } from "../../auth/codeStore";
import type { EmailProvider } from "../../email";

export async function handleKeyChallenge(req: Request, env: Env, email: EmailProvider): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  const code = await issueCode(env, "key", account.email);
  await email.sendCode({ to: account.email, code, purpose: "key" });
  return json({ pending: true });
}
