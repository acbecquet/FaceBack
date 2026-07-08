import { timingSafeEqual } from "../tokens";

const enc = new TextEncoder();
// Cloudflare Workers' Web Crypto caps PBKDF2 at 100,000 iterations; a higher
// count throws at runtime in production (local workerd does not enforce the
// cap, which is why tests pass). 100k is ample for an ephemeral 6-digit code
// that is salted, single-use, limited to 5 attempts, and expires in 10 minutes.
const ITERATIONS = 100_000;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function generateCode(): string {
  // Rejection-sampled uniform 6-digit code, no modulo bias.
  const max = 1_000_000;
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(n % max).padStart(6, "0");
}

async function derive(code: string, salt: Uint8Array): Promise<string> {
  const material = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    material,
    256,
  );
  return b64(new Uint8Array(bits));
}

export async function hashCode(code: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derive(code, saltBytes), salt: b64(saltBytes) };
}

export async function verifyCode(code: string, hash: string, salt: string): Promise<boolean> {
  const candidate = await derive(code, unb64(salt));
  return timingSafeEqual(candidate, hash);
}
