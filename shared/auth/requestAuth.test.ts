import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { getSessionToken, accountSummary, getAuthedAccount } from "./requestAuth";
import { createAccount } from "../data/accounts";
import { addToAllowlist } from "../data/allowlist";
import { signSession } from "./session";

test("reads token from Authorization bearer and from cookie", () => {
  const bearer = new Request("http://x", { headers: { Authorization: "Bearer tok123" } });
  expect(getSessionToken(bearer)).toBe("tok123");
  const cookie = new Request("http://x", { headers: { Cookie: "other=1; fb_session=tok456; z=2" } });
  expect(getSessionToken(cookie)).toBe("tok456");
  expect(getSessionToken(new Request("http://x"))).toBeNull();
});

test("accountSummary sets usesDevKey for allow-listed emails", async () => {
  const acc = await createAccount(env, { username: "friend", email: "friend@example.com" });
  expect((await accountSummary(env, acc)).usesDevKey).toBe(false);
  await addToAllowlist(env, "friend@example.com");
  expect((await accountSummary(env, acc)).usesDevKey).toBe(true);
});

test("getAuthedAccount resolves a valid signed session to the account", async () => {
  const acc = await createAccount(env, { username: "sessioned", email: "sessioned@example.com" });
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const req = new Request("http://x", { headers: { Authorization: `Bearer ${token}` } });
  const resolved = await getAuthedAccount(req, env);
  expect(resolved).toEqual(acc);
});

test("getAuthedAccount returns null with no token and with a garbage token", async () => {
  expect(await getAuthedAccount(new Request("http://x"), env)).toBeNull();
  const garbage = new Request("http://x", { headers: { Authorization: "Bearer not-a-real-token" } });
  expect(await getAuthedAccount(garbage, env)).toBeNull();
});
