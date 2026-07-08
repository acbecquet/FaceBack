import { computeScaledSize, blobToBase64 } from "./imageUtil";

test("computeScaledSize scales the longest edge down to maxEdge, preserving aspect", () => {
  expect(computeScaledSize(4000, 2000, 1024)).toEqual({ width: 1024, height: 512 });
  expect(computeScaledSize(2000, 4000, 1024)).toEqual({ width: 512, height: 1024 });
});

test("computeScaledSize never upscales a small image", () => {
  expect(computeScaledSize(800, 600, 1024)).toEqual({ width: 800, height: 600 });
});

test("computeScaledSize rounds to whole pixels", () => {
  const { width, height } = computeScaledSize(1000, 333, 500);
  expect(Number.isInteger(width)).toBe(true);
  expect(Number.isInteger(height)).toBe(true);
  expect(width).toBe(500);
});

test("blobToBase64 returns the base64 body without a data-URL prefix", async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "application/octet-stream" });
  const b64 = await blobToBase64(blob);
  expect(b64).toBe(btoa(String.fromCharCode(1, 2, 3, 4)));
  expect(b64).not.toContain(",");
});
