import { expect, test } from "vitest";
import { encryptApiKey, decryptApiKey } from "./keyCipher";

const SECRET = "a-strong-server-secret";

test("round-trips an API key and never stores plaintext", async () => {
  const key = "AIzaSy-example-gemini-key";
  const { ciphertext, iv } = await encryptApiKey(key, SECRET);
  expect(ciphertext).not.toContain(key);
  await expect(decryptApiKey(ciphertext, iv, SECRET)).resolves.toBe(key);
});

test("a wrong secret cannot decrypt", async () => {
  const { ciphertext, iv } = await encryptApiKey("secret-key", SECRET);
  await expect(decryptApiKey(ciphertext, iv, "wrong-secret")).rejects.toBeDefined();
});

test("each encryption uses a fresh iv", async () => {
  const a = await encryptApiKey("k", SECRET);
  const b = await encryptApiKey("k", SECRET);
  expect(a.iv).not.toBe(b.iv);
});
