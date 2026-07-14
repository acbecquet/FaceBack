/// <reference types="node" />
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";

// jsdom does not provide crypto.subtle; use Node's WebCrypto implementation.
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

// jsdom's Blob lacks arrayBuffer() (real browsers and iOS Safari 14+ have it);
// back it with FileReader, which jsdom does implement, so collection.ts can
// read image bytes in tests exactly the way it does in the app.
const blobProto = Blob.prototype as unknown as { arrayBuffer?: () => Promise<ArrayBuffer> };
if (!blobProto.arrayBuffer) {
  blobProto.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
