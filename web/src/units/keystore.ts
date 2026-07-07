import { config } from "./config";

const enc = new TextEncoder();

export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (i < a.length ? a.charCodeAt(i) : 0) ^ (i < b.length ? b.charCodeAt(i) : 0);
  }
  return diff === 0;
}

export async function hashPin(
  pin: string,
  saltB64?: string,
): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: config.PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    256,
  );
  return { hash: bytesToB64(new Uint8Array(bits as ArrayBuffer)), salt: bytesToB64(salt) };
}

export async function verifyPin(
  pin: string,
  hashB64: string,
  saltB64: string,
): Promise<boolean> {
  const { hash } = await hashPin(pin, saltB64);
  return timingSafeEqual(hash, hashB64);
}
