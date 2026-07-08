import { otherFacing, startStream, stopStream } from "./camera";

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
