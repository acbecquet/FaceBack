import type { Env } from "../../../shared/env";
import { handleKeyEdit } from "../../../shared/handlers/key/edit";
import { handleSetInitialKey } from "../../../shared/handlers/key/setInitial";

export const onRequestPost = (ctx: { request: Request; env: Env }) => handleSetInitialKey(ctx.request, ctx.env);
export const onRequestPut = (ctx: { request: Request; env: Env }) => handleKeyEdit(ctx.request, ctx.env);
