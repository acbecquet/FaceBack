import type { Env } from "../../shared/env";
import { handleCreateShareLink } from "../../shared/handlers/share/create";

export const onRequestPost = (ctx: { request: Request; env: Env }) =>
  handleCreateShareLink(ctx.request, ctx.env);
