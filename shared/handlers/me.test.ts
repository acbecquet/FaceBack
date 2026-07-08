import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleMe } from "./me";
import { createAccount } from "../data/accounts";
import { signSession } from "../auth/session";

test("me returns the account summary for a valid session", async () => {
  const acc = await createAccount(env, { username: "meuser", email: "meuser@example.com" });
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const res = await handleMe(new Request("http://x/api/me", { headers: { Authorization: `Bearer ${token}` } }), env);
  expect(res.status).toBe(200);
  const body = await res.json() as { username: string; usesDevKey: boolean; isDev: boolean };
  expect(body.username).toBe("meuser");
  expect(body.isDev).toBe(false);
});

test("me without a token is 401", async () => {
  const res = await handleMe(new Request("http://x/api/me"), env);
  expect(res.status).toBe(401);
});
