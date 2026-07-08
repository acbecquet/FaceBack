import type { Env } from "../../../shared/env";
import { handleKeyReveal } from "../../../shared/handlers/key/reveal";

export const onRequestPost = (ctx: { request: Request; env: Env }) => handleKeyReveal(ctx.request, ctx.env);
