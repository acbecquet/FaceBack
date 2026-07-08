import { expect, test } from "vitest";
import { signKeyToken, verifyKeyToken } from "./keyToken";
import { signSession, verifySession } from "./session";

const SECRET = "s";
const NOW = 1_800_000_000_000;

test("key token round-trips and yields the account id", async () => {
  const t = await signKeyToken("acc_1", SECRET, NOW);
  await expect(verifyKeyToken(t, SECRET, NOW + 1000)).resolves.toBe("acc_1");
});

test("a session token is NOT accepted as a key-edit token, and vice versa", async () => {
  const session = await signSession("acc_1", SECRET, NOW);
  await expect(verifyKeyToken(session, SECRET, NOW)).resolves.toBeNull();
  const key = await signKeyToken("acc_1", SECRET, NOW);
  await expect(verifySession(key, SECRET, NOW)).resolves.toBeNull();
});

test("expires after 5 minutes", async () => {
  const t = await signKeyToken("acc_1", SECRET, NOW);
  await expect(verifyKeyToken(t, SECRET, NOW + 6 * 60 * 1000)).resolves.toBeNull();
});
