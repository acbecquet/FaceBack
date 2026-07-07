const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (i < a.length ? a.charCodeAt(i) : 0) ^ (i < b.length ? b.charCodeAt(i) : 0);
  }
  return diff === 0;
}

export async function signToken(
  secret: string,
  payload: Record<string, unknown>,
  ttlSeconds: number,
  nowMs: number,
): Promise<string> {
  const body = { ...payload, exp: nowMs + ttlSeconds * 1000 };
  const encoded = b64url(enc.encode(JSON.stringify(body)));
  const sig = b64url(await hmac(secret, encoded));
  return `${encoded}.${sig}`;
}

export async function verifyToken(
  secret: string,
  token: string,
  nowMs: number,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = b64url(await hmac(secret, encoded));
  if (!timingSafeEqual(sig, expected)) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(encoded)));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp < nowMs) return null;
  return payload;
}
