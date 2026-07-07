import {
  wrapApiKey,
  unwrapApiKey,
  createMemoryWrappingKeyStore,
  WrappingKeyMissingError,
} from "./keystore";

test("wrap then unwrap returns the original API key", async () => {
  const store = createMemoryWrappingKeyStore();
  const secret = "AIzaSy-fake-gemini-key-123";
  const rec = await wrapApiKey(store, secret);
  expect(rec.ciphertext).not.toContain(secret);
  await expect(unwrapApiKey(store, rec)).resolves.toBe(secret);
});

test("a wrong wrapping key cannot decrypt the record", async () => {
  const storeA = createMemoryWrappingKeyStore();
  const rec = await wrapApiKey(storeA, "secret-A");
  const storeB = createMemoryWrappingKeyStore();
  await wrapApiKey(storeB, "seed-b"); // give storeB its own, different wrapping key
  await expect(unwrapApiKey(storeB, rec)).rejects.toBeDefined();
});

test("unwrapping with a missing wrapping key throws WrappingKeyMissingError", async () => {
  const rec = await wrapApiKey(createMemoryWrappingKeyStore(), "secret");
  const emptyStore = createMemoryWrappingKeyStore();
  await expect(unwrapApiKey(emptyStore, rec)).rejects.toThrow(WrappingKeyMissingError);
});
