import { runGeneration } from "./flow";

const baseDeps = () => ({
  now: 1000,
  history: [] as number[],
  downscale: async (_b: Blob) => ({ base64: "IN", mimeType: "image/jpeg", width: 100, height: 100 }),
  detectInput: async () => ({ supported: true, faceCount: 1 }),
  generate: async (_input: { image: { base64: string; mimeType: string } }) => ({
    base64: "OUT",
    mimeType: "image/jpeg",
  }),
  detectOutput: async () => ({ supported: true, faceCount: 0 }),
  toBlob: (_b64: string, _m: string) => new Blob(["x"]),
  saveUsage: (_h: number[]) => {},
});

const blob = new Blob(["input"], { type: "image/jpeg" });

test("happy path returns the generated image and records usage", async () => {
  let saved: number[] | undefined;
  const deps = { ...baseDeps(), saveUsage: (h: number[]) => (saved = h) };
  const out = await runGeneration({ blob }, deps);
  expect(out).toEqual({ base64: "OUT", mimeType: "image/jpeg" });
  expect(saved).toEqual([1000]);
});

test("calls generate with only the downscaled image - no apiKey field at all", async () => {
  let receivedKeys: string[] = [];
  let receivedImage: unknown;
  const deps = {
    ...baseDeps(),
    generate: async (input: { image: { base64: string; mimeType: string } }) => {
      receivedKeys = Object.keys(input);
      receivedImage = input.image;
      return { base64: "OUT", mimeType: "image/jpeg" };
    },
  };
  await runGeneration({ blob }, deps);
  expect(receivedKeys).toEqual(["image"]);
  expect(receivedImage).toEqual({ base64: "IN", mimeType: "image/jpeg" });
});

test("rejects when the usage guard blocks (too soon)", async () => {
  const deps = { ...baseDeps(), history: [1000] }; // last gen == now -> too_soon
  await expect(runGeneration({ blob }, deps)).rejects.toMatchObject({ code: "too_soon" });
});

test("rejects when the input has no detectable face", async () => {
  const deps = { ...baseDeps(), detectInput: async () => ({ supported: true, faceCount: 0 }) };
  await expect(runGeneration({ blob }, deps)).rejects.toMatchObject({ code: "no_face" });
});

test("regenerates once when the first output still shows a face, then succeeds", async () => {
  let calls = 0;
  const deps = {
    ...baseDeps(),
    generate: async () => {
      calls++;
      return { base64: `OUT${calls}`, mimeType: "image/jpeg" };
    },
    detectOutput: async () => ({ supported: true, faceCount: calls === 1 ? 1 : 0 }),
  };
  const out = await runGeneration({ blob }, deps);
  expect(calls).toBe(2);
  expect(out.base64).toBe("OUT2");
});
