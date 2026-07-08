import type { Env } from "../../../shared/env";
import { handleRequest } from "../../../shared/handlers/auth/request";
import { createResendProvider, FROM_ADDRESS } from "../../../shared/email";

export const onRequestPost = (ctx: { request: Request; env: Env }) =>
  handleRequest(ctx.request, ctx.env, createResendProvider(ctx.env.RESEND_API_KEY, FROM_ADDRESS));
