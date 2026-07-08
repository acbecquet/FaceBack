import { expect, test } from "vitest";
import { generateCode, hashCode, verifyCode } from "./codes";

test("generateCode returns 6 digits", () => {
  for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
});

test("hash then verify accepts the right code and rejects others", async () => {
  const { hash, salt } = await hashCode("123456");
  expect(hash).not.toContain("123456");
  await expect(verifyCode("123456", hash, salt)).resolves.toBe(true);
  await expect(verifyCode("000000", hash, salt)).resolves.toBe(false);
});
