import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleKeyReveal } from "./reveal";
import { createAccount, setAccountKey } from "../../data/accounts";
import { signSession } from "../../auth/session";
import { issueCode } from "../../auth/codeStore";
import { encryptApiKey } from "../../crypto/keyCipher";
import { verifyKeyToken } from "../../auth/keyToken";

function req(token: string | undefined, body: unknown): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("http://x/api/key/reveal", { method: "POST", headers, body: JSON.stringify(body) });
}

test("valid code returns the decrypted key and a working editToken", async () => {
  const acc = await createAccount(env, { username: "reveal1", email: "reveal1@example.com" });
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const { ciphertext, iv } = await encryptApiKey("sk-my-real-key", env.KEY_ENC_SECRET);
  await setAccountKey(env, acc.id, ciphertext, iv);
  const code = await issueCode(env, "key", acc.email);

  const res = await handleKeyReveal(req(token, { code }), env);

  expect(res.status).toBe(200);
  const body = (await res.json()) as { apiKey: string | null; editToken: string };
  expect(body.apiKey).toBe("sk-my-real-key");
  await expect(verifyKeyToken(body.editToken, env.SESSION_SECRET, Date.now())).resolves.toBe(acc.id);
});

test("no stored key returns apiKey: null alongside a working editToken", async () => {
  const acc = await createAccount(env, { username: "reveal2", email: "reveal2@example.com" });
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const code = await issueCode(env, "key", acc.email);

  const res = await handleKeyReveal(req(token, { code }), env);

  expect(res.status).toBe(200);
  const body = (await res.json()) as { apiKey: string | null; editToken: string };
  expect(body.apiKey).toBeNull();
  await expect(verifyKeyToken(body.editToken, env.SESSION_SECRET, Date.now())).resolves.toBe(acc.id);
});

test("wrong code returns 401 bad_code", async () => {
  const acc = await createAccount(env, { username: "reveal3", email: "reveal3@example.com" });
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  await issueCode(env, "key", acc.email);

  const res = await handleKeyReveal(req(token, { code: "000000" }), env);

  expect(res.status).toBe(401);
  const body = (await res.json()) as { error: { code: string } };
  expect(body.error.code).toBe("bad_code");
});

test("anonymous caller gets 401", async () => {
  const res = await handleKeyReveal(req(undefined, { code: "123456" }), env);
  expect(res.status).toBe(401);
});
