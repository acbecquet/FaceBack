import type { Env } from "../../shared/env";
import { handleGenerate } from "../../shared/handlers/generate";
import { createGeminiClient } from "../../shared/gemini";

export const onRequestPost = (ctx: { request: Request; env: Env }) =>
  handleGenerate(ctx.request, ctx.env, { makeClient: (apiKey) => createGeminiClient(apiKey) });
