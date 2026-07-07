import { hashPin, verifyPin, bytesToB64, b64ToBytes } from "./keystore";

test("hashPin produces a salt and a hash, and verifyPin round-trips", async () => {
  const { hash, salt } = await hashPin("1234");
  expect(hash.length).toBeGreaterThan(0);
  expect(salt.length).toBeGreaterThan(0);
  await expect(verifyPin("1234", hash, salt)).resolves.toBe(true);
});

test("verifyPin rejects the wrong PIN", async () => {
  const { hash, salt } = await hashPin("1234");
  await expect(verifyPin("0000", hash, salt)).resolves.toBe(false);
});

test("two hashes of the same PIN use different salts", async () => {
  const a = await hashPin("1234");
  const b = await hashPin("1234");
  expect(a.salt).not.toBe(b.salt);
  expect(a.hash).not.toBe(b.hash);
});

test("base64 helpers round-trip arbitrary bytes", () => {
  const bytes = new Uint8Array([0, 1, 2, 254, 255, 128, 42]);
  expect(Array.from(b64ToBytes(bytesToB64(bytes)))).toEqual(Array.from(bytes));
});

test("hashPin derives a 32-byte hash and a 16-byte salt", async () => {
  const { hash, salt } = await hashPin("1234");
  expect(b64ToBytes(hash).length).toBe(32);
  expect(b64ToBytes(salt).length).toBe(16);
});
