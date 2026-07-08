import type { Env } from "../../shared/env";
import { handleMe } from "../../shared/handlers/me";

export const onRequestGet = (ctx: { request: Request; env: Env }) =>
  handleMe(ctx.request, ctx.env);
