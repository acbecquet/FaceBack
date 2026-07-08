import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleVerify } from "./verify";
import { createAccount, getAccountByIdentifier } from "../../data/accounts";
import { issueCode } from "../../auth/codeStore";
import { verifySession } from "../../auth/session";

function req(body: unknown): Request {
  return new Request("http://x/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("correct code verifies the account and issues a session cookie + token", async () => {
  await createAccount(env, { username: "ver", email: "ver@example.com" });
  const code = await issueCode(env, "auth", "ver@example.com");
  const res = await handleVerify(req({ identifier: "ver", code }), env);
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("Set-Cookie") ?? "";
  expect(setCookie).toContain("fb_session=");
  expect(setCookie).toContain("HttpOnly");
  const body = await res.json() as { token: string; account: { username: string; usesDevKey: boolean } };
  expect(body.account.username).toBe("ver");
  // token is a valid session
  expect(await verifySession(body.token, env.SESSION_SECRET, Date.now())).not.toBeNull();
  // account is now verified
  expect((await getAccountByIdentifier(env, "ver"))?.emailVerified).toBe(true);
});

test("wrong code returns 401 and no session", async () => {
  await createAccount(env, { username: "ver2", email: "ver2@example.com" });
  await issueCode(env, "auth", "ver2@example.com");
  const res = await handleVerify(req({ identifier: "ver2", code: "000000" }), env);
  expect(res.status).toBe(401);
  expect(res.headers.get("Set-Cookie")).toBeNull();
});
