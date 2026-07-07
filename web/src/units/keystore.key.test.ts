import {
  wrapApiKey,
  unwrapApiKey,
  createMemoryWrappingKeyStore,
} from "./keystore";

test("wrap then unwrap returns the original API key", async () => {
  const store = createMemoryWrappingKeyStore();
  const secret = "AIzaSy-fake-gemini-key-123";
  const rec = await wrapApiKey(store, secret);
  expect(rec.ciphertext).not.toContain(secret);
  await expect(unwrapApiKey(store, rec)).resolves.toBe(secret);
});

test("a wrong wrapping key cannot decrypt the record", async () => {
  const rec = await wrapApiKey(createMemoryWrappingKeyStore(), "secret-A");
  const otherStore = createMemoryWrappingKeyStore();
  await expect(unwrapApiKey(otherStore, rec)).rejects.toBeDefined();
});
