import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { issueCode, verifyStoredCode } from "./codeStore";

test("issue then verify the correct code succeeds once and burns it", async () => {
  const code = await issueCode(env, "auth", "u@example.com");
  expect(code).toMatch(/^\d{6}$/);
  expect(await verifyStoredCode(env, "auth", "u@example.com", code)).toBe(true);
  // burned: a second verify of the same code fails
  expect(await verifyStoredCode(env, "auth", "u@example.com", code)).toBe(false);
});

test("a wrong code fails, and after 5 attempts the code is burned", async () => {
  const code = await issueCode(env, "auth", "v@example.com");
  for (let i = 0; i < 5; i++) expect(await verifyStoredCode(env, "auth", "v@example.com", "000001")).toBe(false);
  // even the correct code no longer works after the attempt cap
  expect(await verifyStoredCode(env, "auth", "v@example.com", code)).toBe(false);
});

test("verifying with no issued code fails", async () => {
  expect(await verifyStoredCode(env, "auth", "absent@example.com", "123456")).toBe(false);
});
