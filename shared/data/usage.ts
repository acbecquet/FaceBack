import type { Env } from "../env";

export const FRIEND_CAP = 10;
export const GLOBAL_CAP = 200;
const TTL = 48 * 60 * 60; // seconds

export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}
const norm = (s: string) => s.trim().toLowerCase();

async function readInt(env: Env, key: string): Promise<number> {
  const v = await env.KV.get(key);
  return v ? parseInt(v, 10) || 0 : 0;
}

export async function getUsage(env: Env, email: string, nowMs: number): Promise<{ friend: number; global: number }> {
  const day = dayKey(nowMs);
  const [friend, global] = await Promise.all([
    readInt(env, `usage:friend:${norm(email)}:${day}`),
    readInt(env, `usage:dev:global:${day}`),
  ]);
  return { friend, global };
}

export async function incrementUsage(env: Env, email: string, nowMs: number): Promise<void> {
  const day = dayKey(nowMs);
  const fKey = `usage:friend:${norm(email)}:${day}`;
  const gKey = `usage:dev:global:${day}`;
  const cur = await getUsage(env, email, nowMs);
  await Promise.all([
    env.KV.put(fKey, String(cur.friend + 1), { expirationTtl: TTL }),
    env.KV.put(gKey, String(cur.global + 1), { expirationTtl: TTL }),
  ]);
}

export function overCap(usage: { friend: number; global: number }, isOwner: boolean): boolean {
  if (usage.global >= GLOBAL_CAP) return true;
  if (!isOwner && usage.friend >= FRIEND_CAP) return true;
  return false;
}
