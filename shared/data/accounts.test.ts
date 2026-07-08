import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import {
  createAccount, getAccountByIdentifier, getAccountById,
  markEmailVerified, setAccountKey, getAccountKeyCipher, DuplicateAccountError,
} from "./accounts";

test("create then look up by username and by email", async () => {
  const acc = await createAccount(env, { username: "Alice", email: "Alice@Example.com" });
  expect(acc.username).toBe("alice");
  expect(acc.email).toBe("alice@example.com");
  expect(acc.emailVerified).toBe(false);
  expect(acc.hasKey).toBe(false);
  expect(await getAccountByIdentifier(env, "alice")).toMatchObject({ id: acc.id });
  expect(await getAccountByIdentifier(env, "alice@example.com")).toMatchObject({ id: acc.id });
  expect(await getAccountById(env, acc.id)).toMatchObject({ id: acc.id });
});

test("duplicate username or email is rejected", async () => {
  await createAccount(env, { username: "bob", email: "bob@example.com" });
  await expect(createAccount(env, { username: "bob", email: "other@example.com" }))
    .rejects.toBeInstanceOf(DuplicateAccountError);
  await expect(createAccount(env, { username: "other", email: "bob@example.com" }))
    .rejects.toBeInstanceOf(DuplicateAccountError);
});

test("verify flag and key storage round-trip", async () => {
  const acc = await createAccount(env, { username: "carol", email: "carol@example.com" });
  await markEmailVerified(env, acc.id);
  await setAccountKey(env, acc.id, "CIPHER", "IV");
  expect(await getAccountKeyCipher(env, acc.id)).toEqual({ ciphertext: "CIPHER", iv: "IV" });
  expect((await getAccountById(env, acc.id))!.hasKey).toBe(true);
  expect((await getAccountById(env, acc.id))!.emailVerified).toBe(true);
});
