import type { Env } from "../shared/env";
import { handleRedeemShareLink } from "../shared/handlers/share/redeem";

// GET /r?t=<token> - a clickable share link. Sets the session cookie and
// redirects into the app.
export const onRequestGet = (ctx: { request: Request; env: Env }) => {
  const token = new URL(ctx.request.url).searchParams.get("t") ?? "";
  return handleRedeemShareLink(token, ctx.env);
};
