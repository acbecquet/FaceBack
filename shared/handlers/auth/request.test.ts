import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleRequest } from "./request";
import { createRecordingProvider } from "../../email";
import { createAccount } from "../../data/accounts";

function req(identifier: unknown): Request {
  return new Request("http://x/api/auth/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "8.8.8.8" },
    body: JSON.stringify({ identifier }),
  });
}

test("existing account gets a code by email (looked up by username or email)", async () => {
  await createAccount(env, { username: "signin", email: "signin@example.com" });
  const email = createRecordingProvider();
  const res = await handleRequest(req("signin"), env, email);
  expect(res.status).toBe(200);
  expect(email.sent[0].to).toBe("signin@example.com");
});

test("unknown identifier returns 404 no_account and sends nothing", async () => {
  const email = createRecordingProvider();
  const res = await handleRequest(req("ghost"), env, email);
  expect(res.status).toBe(404);
  expect(email.sent).toHaveLength(0);
});
