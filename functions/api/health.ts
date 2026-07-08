import type { Env } from "../../shared/env";
import { handleHealth } from "../../shared/handlers/health";

export const onRequestGet = (ctx: { request: Request; env: Env }) =>
  handleHealth(ctx.request, ctx.env);
