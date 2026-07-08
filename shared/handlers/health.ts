import type { Env } from "../env";
import { json } from "../http";

export async function handleHealth(_req: Request, env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('accounts','dev_allowlist') ORDER BY name",
  ).all<{ name: string }>();
  return json({ ok: true, tables: rows.results.map((r) => r.name) });
}
