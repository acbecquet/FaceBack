import type { Env } from "../../../shared/env";
import { handleKeyEdit } from "../../../shared/handlers/key/edit";

export const onRequestPut = (ctx: { request: Request; env: Env }) => handleKeyEdit(ctx.request, ctx.env);
