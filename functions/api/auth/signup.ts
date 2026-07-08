import type { Env } from "../../../shared/env";
import { handleSignup } from "../../../shared/handlers/auth/signup";
import { createResendProvider, FROM_ADDRESS } from "../../../shared/email";

export const onRequestPost = (ctx: { request: Request; env: Env }) =>
  handleSignup(ctx.request, ctx.env, createResendProvider(ctx.env.RESEND_API_KEY, FROM_ADDRESS));
