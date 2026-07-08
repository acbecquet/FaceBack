import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { getSessionToken, accountSummary } from "./requestAuth";
import { createAccount } from "../data/accounts";
import { addToAllowlist } from "../data/allowlist";

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
