import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleKeyEdit } from "./edit";
import { createAccount, getAccountKeyCipher } from "../../data/accounts";
import { signSession } from "../../auth/session";
import { signKeyToken } from "../../auth/keyToken";
import { decryptApiKey } from "../../crypto/keyCipher";

function req(token: string | undefined, body: unknown): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("http://x/api/key", { method: "PUT", headers, body: JSON.stringify(body) });
}

test("a valid own editToken stores the key, round-tripping via getAccountKeyCipher + decryptApiKey", async () => {
  const acc = await createAccount(env, { username: "edit1", email: "edit1@example.com" });
  const session = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const editToken = await signKeyToken(acc.id, env.SESSION_SECRET, Date.now());

  const res = await handleKeyEdit(req(session, { apiKey: "sk-new-key", editToken }), env);

  expect(res.status).toBe(200);
  const cipher = await getAccountKeyCipher(env, acc.id);
  expect(cipher).not.toBeNull();
  const decrypted = await decryptApiKey(cipher!.ciphertext, cipher!.iv, env.KEY_ENC_SECRET);
  expect(decrypted).toBe("sk-new-key");
});

test("a missing editToken returns 401 and does not store the key", async () => {
  const acc = await createAccount(env, { username: "edit2", email: "edit2@example.com" });
  const session = await signSession(acc.id, env.SESSION_SECRET, Date.now());

  const res = await handleKeyEdit(req(session, { apiKey: "sk-new-key" }), env);

  expect(res.status).toBe(401);
  expect(await getAccountKeyCipher(env, acc.id)).toBeNull();
});

test("an invalid (garbage) editToken returns 401", async () => {
  const acc = await createAccount(env, { username: "edit3", email: "edit3@example.com" });
  const session = await signSession(acc.id, env.SESSION_SECRET, Date.now());

  const res = await handleKeyEdit(req(session, { apiKey: "sk-new-key", editToken: "garbage" }), env);

  expect(res.status).toBe(401);
});

test("an editToken issued for a DIFFERENT account returns 401", async () => {
  const acc = await createAccount(env, { username: "edit4", email: "edit4@example.com" });
  const other = await createAccount(env, { username: "edit4b", email: "edit4b@example.com" });
  const session = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const otherEditToken = await signKeyToken(other.id, env.SESSION_SECRET, Date.now());

  const res = await handleKeyEdit(req(session, { apiKey: "sk-new-key", editToken: otherEditToken }), env);

  expect(res.status).toBe(401);
  expect(await getAccountKeyCipher(env, acc.id)).toBeNull();
});

test("anonymous caller gets 401", async () => {
  const editToken = await signKeyToken("acc_someone", env.SESSION_SECRET, Date.now());
  const res = await handleKeyEdit(req(undefined, { apiKey: "sk-new-key", editToken }), env);
  expect(res.status).toBe(401);
});

test("empty apiKey returns 400", async () => {
  const acc = await createAccount(env, { username: "edit5", email: "edit5@example.com" });
  const session = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const editToken = await signKeyToken(acc.id, env.SESSION_SECRET, Date.now());

  const res = await handleKeyEdit(req(session, { apiKey: "   ", editToken }), env);

  expect(res.status).toBe(400);
});
