import { expect, test } from "vitest";
import { signShareToken, verifyShareToken, SHARE_TTL_SECONDS } from "./shareToken";
import { signSession, verifySession } from "./session";

const SECRET = "s";
const NOW = 1_800_000_000_000;

test("share token round-trips and yields the account id and absolute expiry", async () => {
  const t = await signShareToken("acc_1", SECRET, NOW);
  const r = await verifyShareToken(t, SECRET, NOW + 1000);
  expect(r?.sub).toBe("acc_1");
  expect(r?.expMs).toBe(NOW + SHARE_TTL_SECONDS * 1000);
});

test("a session token is NOT accepted as a share token, and vice versa", async () => {
  const session = await signSession("acc_1", SECRET, NOW);
  await expect(verifyShareToken(session, SECRET, NOW)).resolves.toBeNull();
  const share = await signShareToken("acc_1", SECRET, NOW);
  await expect(verifySession(share, SECRET, NOW)).resolves.toBeNull();
});

test("expires after one hour", async () => {
  const t = await signShareToken("acc_1", SECRET, NOW);
  await expect(verifyShareToken(t, SECRET, NOW + (SHARE_TTL_SECONDS + 1) * 1000)).resolves.toBeNull();
});

test("a tampered or wrong-secret token is rejected", async () => {
  const t = await signShareToken("acc_1", SECRET, NOW);
  await expect(verifyShareToken(t, "other", NOW)).resolves.toBeNull();
  await expect(verifyShareToken(t + "x", SECRET, NOW)).resolves.toBeNull();
});
