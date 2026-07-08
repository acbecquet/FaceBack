import type { Env } from "../../../shared/env";
import { handleLogout } from "../../../shared/handlers/auth/logout";

export const onRequestPost = (ctx: { request: Request; env: Env }) =>
  handleLogout(ctx.request, ctx.env);
