import { afterEach, expect, test } from "vitest";
import { detectFaces, hasDetectableFace, looksLikeBackOfHead } from "./faceGate";

const original = (globalThis as any).FaceDetector;
afterEach(() => {
  (globalThis as any).FaceDetector = original;
});

function mockFaceDetector(count: number) {
  (globalThis as any).FaceDetector = class {
    async detect() {
      return Array.from({ length: count });
    }
  };
}

test("detectFaces reports the count when FaceDetector is supported", async () => {
  mockFaceDetector(2);
  const r = await detectFaces({} as CanvasImageSource);
  expect(r).toEqual({ supported: true, faceCount: 2 });
});

test("detectFaces reports unsupported when FaceDetector is absent", async () => {
  (globalThis as any).FaceDetector = undefined;
  const r = await detectFaces({} as CanvasImageSource);
  expect(r).toEqual({ supported: false, faceCount: 0 });
});

test("hasDetectableFace gates: face -> true, no face -> false, unsupported -> true (degrade open)", () => {
  expect(hasDetectableFace({ supported: true, faceCount: 1 })).toBe(true);
  expect(hasDetectableFace({ supported: true, faceCount: 0 })).toBe(false);
  expect(hasDetectableFace({ supported: false, faceCount: 0 })).toBe(true);
});

test("looksLikeBackOfHead: a detected face is suspicious, no face / unsupported is acceptable", () => {
  expect(looksLikeBackOfHead({ supported: true, faceCount: 1 })).toBe(false);
  expect(looksLikeBackOfHead({ supported: true, faceCount: 0 })).toBe(true);
  expect(looksLikeBackOfHead({ supported: false, faceCount: 0 })).toBe(true);
});
