import type { Env } from "../../../shared/env";
import { handleKeyChallenge } from "../../../shared/handlers/key/challenge";
import { createResendProvider, FROM_ADDRESS } from "../../../shared/email";

export const onRequestPost = (ctx: { request: Request; env: Env }) =>
  handleKeyChallenge(ctx.request, ctx.env, createResendProvider(ctx.env.RESEND_API_KEY, FROM_ADDRESS));
