import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleKeyChallenge } from "./challenge";
import { createRecordingProvider } from "../../email";
import { createAccount } from "../../data/accounts";
import { signSession } from "../../auth/session";

function req(token?: string, ip?: string): Request {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers["CF-Connecting-IP"] = ip;
  return new Request("http://x/api/key/challenge", { method: "POST", headers });
}

test("signed-in caller gets a key-purpose code emailed to their account email", async () => {
  const acc = await createAccount(env, { username: "keychal", email: "keychal@example.com" });
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const email = createRecordingProvider();
  const res = await handleKeyChallenge(req(token), env, email);
  expect(res.status).toBe(200);
  expect(email.sent).toHaveLength(1);
  expect(email.sent[0].to).toBe("keychal@example.com");
  expect(email.sent[0].purpose).toBe("key");
});

test("anonymous caller gets 401 and no email is sent", async () => {
  const email = createRecordingProvider();
  const res = await handleKeyChallenge(req(), env, email);
  expect(res.status).toBe(401);
  expect(email.sent).toHaveLength(0);
});

test("per-email rate limit: 6th challenge within an hour is rejected with 429", async () => {
  const acc = await createAccount(env, { username: "keychalrl", email: "keychalrl@example.com" });
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const email = createRecordingProvider();
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await handleKeyChallenge(req(token, "198.51.100.42"), env, email);
    statuses.push(res.status);
  }
  expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  expect(email.sent).toHaveLength(5);
});
