import type { Env } from "../env";

export async function checkRateLimit(
  env: Env,
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
  nowMs: number,
): Promise<boolean> {
  const bucket = Math.floor(nowMs / 1000 / windowSeconds);
  const k = `rl:${scope}:${key}:${bucket}`;
  const current = parseInt((await env.KV.get(k)) ?? "0", 10) || 0;
  if (current >= limit) return false;
  await env.KV.put(k, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return true;
}
