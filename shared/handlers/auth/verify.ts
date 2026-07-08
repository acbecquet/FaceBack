import type { Env } from "../../env";
import { errorResponse } from "../../http";
import { getAccountByIdentifier, markEmailVerified } from "../../data/accounts";
import { verifyStoredCode } from "../../auth/codeStore";
import { signSession, sessionCookie } from "../../auth/session";
import { accountSummary } from "../../auth/requestAuth";

export async function handleVerify(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { identifier?: unknown; code?: unknown } | null;
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!identifier || !code) return errorResponse("bad_input", "Identifier and code are required.", 400);

  const account = await getAccountByIdentifier(env, identifier);
  const badCode = () => errorResponse("bad_code", "Invalid or expired code.", 401);
  if (!account) return badCode();
  if (!(await verifyStoredCode(env, "auth", account.email, code))) return badCode();

  await markEmailVerified(env, account.id);
  const token = await signSession(account.id, env.SESSION_SECRET, Date.now());
  const summary = await accountSummary(env, { ...account, emailVerified: true });
  return new Response(JSON.stringify({ token, account: summary }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(token) },
  });
}
