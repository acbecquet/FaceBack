import type { Env } from "../env";
const norm = (s: string) => s.trim().toLowerCase();

export async function addToAllowlist(env: Env, email: string): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO dev_allowlist (email, added_at) VALUES (?, ?)")
    .bind(norm(email), new Date().toISOString()).run();
}
export async function removeFromAllowlist(env: Env, email: string): Promise<void> {
  await env.DB.prepare("DELETE FROM dev_allowlist WHERE email = ?").bind(norm(email)).run();
}
export async function isAllowlisted(env: Env, email: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 AS x FROM dev_allowlist WHERE email = ?").bind(norm(email)).first();
  return row != null;
}
export async function listAllowlist(env: Env): Promise<string[]> {
  const rows = await env.DB.prepare("SELECT email FROM dev_allowlist ORDER BY added_at").all<{ email: string }>();
  return rows.results.map((r) => r.email);
}
