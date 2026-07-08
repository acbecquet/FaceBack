import type { Env } from "../../../shared/env";
import { handleVerify } from "../../../shared/handlers/auth/verify";

export const onRequestPost = (ctx: { request: Request; env: Env }) =>
  handleVerify(ctx.request, ctx.env);
