import { signToken, verifyToken } from "./lib/tokens";
import type { EmailProvider } from "./lib/email";
import { json, errorResponse } from "./lib/http";

const enc = new TextEncoder();

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function handleRecovery(
  req: Request,
  deps: { secret: string; email: EmailProvider; nowMs: number; makeCode?: () => string },
): Promise<Response> {
  const path = new URL(req.url).pathname;
  const makeCode = deps.makeCode ?? randomCode;

  if (path.endsWith("/recovery/request")) {
    const body = await req.json().catch(() => null);
    const email = body?.email;
    if (typeof email !== "string" || !email.includes("@")) {
      return errorResponse("bad_input", "Valid email required", 400);
    }
    const code = makeCode();
    const token = await signToken(
      deps.secret,
      { emailHash: await sha256Hex(email), codeHash: await sha256Hex(code) },
      15 * 60,
      deps.nowMs,
    );
    await deps.email.send(email, "Your FaceBack recovery code", `Your PIN recovery code is: ${code}`);
    return json({ token });
  }

  if (path.endsWith("/recovery/verify")) {
    const body = await req.json().catch(() => null);
    const token = body?.token;
    const code = body?.code;
    if (typeof token !== "string" || typeof code !== "string") {
      return errorResponse("bad_input", "token and code required", 400);
    }
    const payload = await verifyToken(deps.secret, token, deps.nowMs);
    if (!payload || payload.codeHash !== (await sha256Hex(code))) {
      return errorResponse("invalid_code", "Code is invalid or expired", 401);
    }
    const resetToken = await signToken(
      deps.secret,
      { emailHash: payload.emailHash, purpose: "reset" },
      10 * 60,
      deps.nowMs,
    );
    return json({ resetToken });
  }

  return errorResponse("not_found", "Unknown recovery path", 404);
}
