import { afterEach, vi } from "vitest";
import { captureFrame, otherFacing, startStream, stopStream } from "./camera";

test("otherFacing toggles between environment and user", () => {
  expect(otherFacing("environment")).toBe("user");
  expect(otherFacing("user")).toBe("environment");
});

test("startStream requests the given facingMode with audio off", async () => {
  let captured: MediaStreamConstraints | undefined;
  const md = {
    getUserMedia: async (c: MediaStreamConstraints) => {
      captured = c;
      return {} as MediaStream;
    },
  } as unknown as MediaDevices;

  await startStream("environment", md);
  expect(captured).toEqual({ video: { facingMode: "environment" }, audio: false });
});

test("stopStream stops every track", () => {
  const stops: number[] = [];
  const stream = {
    getTracks: () => [
      { stop: () => stops.push(1) },
      { stop: () => stops.push(2) },
    ],
  } as unknown as MediaStream;
  stopStream(stream);
  expect(stops).toEqual([1, 2]);
});

afterEach(() => vi.restoreAllMocks());

// jsdom has no real canvas, so mock the 2D context and assert the draw ops.
function mockCanvas() {
  const calls: string[] = [];
  const ctx = {
    translate: (x: number, y: number) => calls.push(`translate(${x},${y})`),
    scale: (x: number, y: number) => calls.push(`scale(${x},${y})`),
    drawImage: () => calls.push("drawImage"),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob) => void) => cb(new Blob(["x"], { type: "image/jpeg" })),
  };
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
    tag === "canvas" ? (canvas as unknown as HTMLCanvasElement) : realCreate(tag),
  );
  return calls;
}

const fakeVideo = { videoWidth: 100, videoHeight: 80 } as HTMLVideoElement;

test("captureFrame mirrors the frame horizontally when mirror is true (front camera)", async () => {
  const calls = mockCanvas();
  await captureFrame(fakeVideo, true);
  // Flip transform must be applied before the draw.
  expect(calls).toEqual(["translate(100,0)", "scale(-1,1)", "drawImage"]);
});

test("captureFrame draws the frame as-is when mirror is false (back camera / default)", async () => {
  const calls = mockCanvas();
  await captureFrame(fakeVideo);
  expect(calls).toEqual(["drawImage"]);
});
