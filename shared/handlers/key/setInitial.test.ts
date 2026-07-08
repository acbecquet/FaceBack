import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleSetInitialKey } from "./setInitial";
import { createAccount, getAccountKeyCipher } from "../../data/accounts";
import { signSession } from "../../auth/session";
import { decryptApiKey } from "../../crypto/keyCipher";

function req(token: string | undefined, body: unknown): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("http://x/api/key", { method: "POST", headers, body: JSON.stringify(body) });
}

test("a signed-in account with no key POSTs an apiKey and it is stored", async () => {
  const acc = await createAccount(env, { username: "init1", email: "init1@example.com" });
  const session = await signSession(acc.id, env.SESSION_SECRET, Date.now());

  const res = await handleSetInitialKey(req(session, { apiKey: "sk-test-key-1" }), env);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  const cipher = await getAccountKeyCipher(env, acc.id);
  expect(cipher).not.toBeNull();
  const decrypted = await decryptApiKey(cipher!.ciphertext, cipher!.iv, env.KEY_ENC_SECRET);
  expect(decrypted).toBe("sk-test-key-1");
});

test("a second POST to the same account returns 409 key_exists and does not change the first key", async () => {
  const acc = await createAccount(env, { username: "init2", email: "init2@example.com" });
  const session = await signSession(acc.id, env.SESSION_SECRET, Date.now());

  // First POST
  const res1 = await handleSetInitialKey(req(session, { apiKey: "sk-first-key" }), env);
  expect(res1.status).toBe(200);

  // Verify first key is stored
  let cipher = await getAccountKeyCipher(env, acc.id);
  let decrypted = await decryptApiKey(cipher!.ciphertext, cipher!.iv, env.KEY_ENC_SECRET);
  expect(decrypted).toBe("sk-first-key");

  // Second POST
  const res2 = await handleSetInitialKey(req(session, { apiKey: "sk-second-key" }), env);
  expect(res2.status).toBe(409);
  const body = await res2.json();
  expect(body).toEqual({ error: { code: "key_exists", message: "A key is already set. Use edit instead." } });

  // Verify first key is unchanged
  cipher = await getAccountKeyCipher(env, acc.id);
  decrypted = await decryptApiKey(cipher!.ciphertext, cipher!.iv, env.KEY_ENC_SECRET);
  expect(decrypted).toBe("sk-first-key");
});

test("anonymous caller gets 401", async () => {
  const res = await handleSetInitialKey(req(undefined, { apiKey: "sk-test-key" }), env);
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body).toEqual({ error: { code: "unauthorized", message: "Sign in required." } });
});

test("empty apiKey returns 400", async () => {
  const acc = await createAccount(env, { username: "init4", email: "init4@example.com" });
  const session = await signSession(acc.id, env.SESSION_SECRET, Date.now());

  const res = await handleSetInitialKey(req(session, { apiKey: "   " }), env);

  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body).toEqual({ error: { code: "bad_input", message: "An API key is required." } });
});
