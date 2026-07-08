import type { Env } from "../env";
import { generateCode, hashCode, verifyCode } from "../crypto/codes";

const TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

interface CodeRecord {
  hash: string;
  salt: string;
  attempts: number;
}

function keyFor(purpose: string, identifier: string): string {
  return `code:${purpose}:${identifier.trim().toLowerCase()}`;
}

export async function issueCode(env: Env, purpose: "auth" | "key", identifier: string): Promise<string> {
  const code = generateCode();
  const { hash, salt } = await hashCode(code);
  const rec: CodeRecord = { hash, salt, attempts: 0 };
  await env.KV.put(keyFor(purpose, identifier), JSON.stringify(rec), { expirationTtl: TTL_SECONDS });
  return code;
}

export async function verifyStoredCode(
  env: Env,
  purpose: "auth" | "key",
  identifier: string,
  code: string,
): Promise<boolean> {
  const k = keyFor(purpose, identifier);
  const raw = await env.KV.get(k);
  if (!raw) return false;
  const rec = JSON.parse(raw) as CodeRecord;
  if (rec.attempts >= MAX_ATTEMPTS) {
    await env.KV.delete(k);
    return false;
  }
  if (await verifyCode(code, rec.hash, rec.salt)) {
    await env.KV.delete(k);
    return true;
  }
  rec.attempts += 1;
  if (rec.attempts >= MAX_ATTEMPTS) await env.KV.delete(k);
  else await env.KV.put(k, JSON.stringify(rec), { expirationTtl: TTL_SECONDS });
  return false;
}
