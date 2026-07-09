import type { Env } from "../../env";
import { signToken } from "../../tokens";
import { sessionCookie } from "../../auth/session";
import { verifyShareToken } from "../../auth/shareToken";

// Redeem a share link: validate the token and, if good, set a session cookie
// for the target account and bounce to the app. The minted session is pinned
// to the share token's own expiry, so borrowed access always ends when the
// link would have - never the default one-year session. Invalid or expired
// links just land on the app (which shows sign-in); no cookie is set.
export async function handleRedeemShareLink(token: string, env: Env): Promise<Response> {
  const now = Date.now();
  const result = token ? await verifyShareToken(token, env.SESSION_SECRET, now) : null;
  if (!result) {
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }
  const remainingSeconds = Math.max(1, Math.ceil((result.expMs - now) / 1000));
  const session = await signToken(
    env.SESSION_SECRET,
    { sub: result.sub, typ: "session" },
    remainingSeconds,
    now,
  );
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": sessionCookie(session, remainingSeconds) },
  });
}
