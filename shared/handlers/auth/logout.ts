import type { Env } from "../../env";
import { clearSessionCookie } from "../../auth/session";

export async function handleLogout(_req: Request, _env: Env): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie() },
  });
}
