import { expect, test } from "vitest";
import { signSession, verifySession, sessionCookie, clearSessionCookie } from "./session";
import { signToken } from "../tokens";

const SECRET = "session-secret";
const NOW = 1_800_000_000_000;

test("signed session verifies and yields the account id", async () => {
  const token = await signSession("acc_123", SECRET, NOW);
  await expect(verifySession(token, SECRET, NOW + 1000)).resolves.toBe("acc_123");
});

test("a tampered or wrong-secret token is rejected", async () => {
  const token = await signSession("acc_123", SECRET, NOW);
  await expect(verifySession(token, "other", NOW)).resolves.toBeNull();
  await expect(verifySession(token + "x", SECRET, NOW)).resolves.toBeNull();
});

test("an expired token (beyond 1 year) is rejected", async () => {
  const token = await signSession("acc_123", SECRET, NOW);
  const overAYear = NOW + 366 * 24 * 60 * 60 * 1000;
  await expect(verifySession(token, SECRET, overAYear)).resolves.toBeNull();
});

test("a token without typ: 'session' (e.g. a different-purpose token sharing the same secret) is rejected", async () => {
  const noTypToken = await signToken(SECRET, { sub: "acc_x" }, 3600, NOW);
  await expect(verifySession(noTypToken, SECRET, NOW)).resolves.toBeNull();

  const wrongTypToken = await signToken(SECRET, { sub: "acc_x", typ: "key-edit" }, 3600, NOW);
  await expect(verifySession(wrongTypToken, SECRET, NOW)).resolves.toBeNull();
});

test("cookie helpers set HttpOnly Secure and clear", () => {
  expect(sessionCookie("t")).toMatch(/HttpOnly/);
  expect(sessionCookie("t")).toMatch(/Secure/);
  expect(clearSessionCookie()).toMatch(/Max-Age=0/);
});
