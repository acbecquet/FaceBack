import type { Env } from "../../../shared/env";
import {
  handleListAllowlist,
  handleAddAllowlist,
  handleRemoveAllowlist,
} from "../../../shared/handlers/dev/allowlist";

export const onRequestGet = (ctx: { request: Request; env: Env }) =>
  handleListAllowlist(ctx.request, ctx.env);
export const onRequestPost = (ctx: { request: Request; env: Env }) =>
  handleAddAllowlist(ctx.request, ctx.env);
export const onRequestDelete = (ctx: { request: Request; env: Env }) =>
  handleRemoveAllowlist(ctx.request, ctx.env);
