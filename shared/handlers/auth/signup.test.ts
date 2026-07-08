import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleSignup } from "./signup";
import { createRecordingProvider } from "../../email";
import { getAccountByIdentifier } from "../../data/accounts";

function req(body: unknown, ip = "9.9.9.9"): Request {
  return new Request("http://x/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
}

test("new signup creates an unverified account and emails a code", async () => {
  const email = createRecordingProvider();
  const res = await handleSignup(req({ username: "newby", email: "newby@example.com" }), env, email);
  expect(res.status).toBe(200);
  expect(email.sent).toHaveLength(1);
  expect(email.sent[0].to).toBe("newby@example.com");
  expect(email.sent[0].code).toMatch(/^\d{6}$/);
  const acc = await getAccountByIdentifier(env, "newby@example.com");
  expect(acc?.emailVerified).toBe(false);
});

test("invalid username (contains @) is a 400 and sends no email", async () => {
  const email = createRecordingProvider();
  const res = await handleSignup(req({ username: "a@b", email: "z@example.com" }), env, email);
  expect(res.status).toBe(400);
  expect(email.sent).toHaveLength(0);
});

test("taken username with a different email is rejected", async () => {
  const email = createRecordingProvider();
  await handleSignup(req({ username: "dupe", email: "first@example.com" }), env, email);
  const res = await handleSignup(req({ username: "dupe", email: "second@example.com" }), env, email);
  expect(res.status).toBe(409);
});
