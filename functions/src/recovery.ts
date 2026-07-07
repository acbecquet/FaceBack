import { signToken, verifyToken, timingSafeEqual } from "./lib/tokens";
import type { EmailProvider } from "./lib/email";
import { json, errorResponse } from "./lib/http";

const enc = new TextEncoder();

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2Hex(input: string, saltB64: string, iterations = 210_000): Promise<string> {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const material = await crypto.subtle.importKey("raw", enc.encode(input), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSaltB64(): string {
  const s = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...s));
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars
  const out: string[] = [];
  while (out.length < 8) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1));
    if (byte < 248) out.push(alphabet[byte % alphabet.length]);
  }
  return out.join("");
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
    const codeSalt = randomSaltB64();
    const codeHash = await pbkdf2Hex(code, codeSalt);
    const token = await signToken(
      deps.secret,
      { emailHash: await sha256Hex(email), codeSalt, codeHash },
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
    if (
      !payload ||
      typeof payload.codeSalt !== "string" ||
      typeof payload.codeHash !== "string"
    ) {
      return errorResponse("invalid_code", "Code is invalid or expired", 401);
    }
    const submittedHash = await pbkdf2Hex(code, payload.codeSalt);
    if (!timingSafeEqual(submittedHash, payload.codeHash)) {
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
