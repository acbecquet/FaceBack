import { createIndexedDbWrappingKeyStore } from "./indexeddb";
import { wrapApiKey, unwrapApiKey } from "./keystore";

test("the IndexedDB store persists the wrapping key across store instances", async () => {
  const storeA = createIndexedDbWrappingKeyStore();
  const rec = await wrapApiKey(storeA, "persisted-secret");

  // A fresh store instance reads the same persisted CryptoKey from IndexedDB.
  const storeB = createIndexedDbWrappingKeyStore();
  await expect(unwrapApiKey(storeB, rec)).resolves.toBe("persisted-secret");
});
