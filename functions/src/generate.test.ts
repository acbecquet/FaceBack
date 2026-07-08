import { handleGenerate } from "./generate";
import type { GeminiClient } from "../../shared/gemini";

const bigImage = "A".repeat(200); // passes the plausibility size floor

function req(body: unknown): Request {
  return new Request("http://x/generate", { method: "POST", body: JSON.stringify(body) });
}

function clientReturning(...images: string[]): { makeClient: () => GeminiClient; calls: () => number } {
  let i = 0;
  return {
    calls: () => i,
    makeClient: () => ({
      async generateImage() {
        const base64 = images[Math.min(i, images.length - 1)];
        i++;
        return { imageBase64: base64, mimeType: "image/jpeg" };
      },
    }),
  };
}

test("returns the generated image on the happy path (one call)", async () => {
  const c = clientReturning(bigImage);
  const res = await handleGenerate(req({ image: { base64: "in", mimeType: "image/png" }, key: "k" }), c);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ image: { base64: bigImage, mimeType: "image/jpeg" } });
  expect(c.calls()).toBe(1);
});

test("retries once when the first result is implausible, then succeeds", async () => {
  const c = clientReturning("tiny", bigImage); // first too small -> retry -> ok
  const res = await handleGenerate(req({ image: { base64: "in", mimeType: "image/png" }, key: "k" }), c);
  expect(res.status).toBe(200);
  expect(c.calls()).toBe(2);
});

test("returns 502 generation_failed when both attempts are implausible", async () => {
  const c = clientReturning("tiny", "tiny");
  const res = await handleGenerate(req({ image: { base64: "in", mimeType: "image/png" }, key: "k" }), c);
  expect(res.status).toBe(502);
  expect(((await res.json()) as any).error.code).toBe("generation_failed");
});

test("rejects a request missing the image or key with 400", async () => {
  const c = clientReturning(bigImage);
  const res = await handleGenerate(req({ key: "k" }), c);
  expect(res.status).toBe(400);
  expect(((await res.json()) as any).error.code).toBe("bad_input");
});

test("rejects malformed (non-string) image fields with 400 and makes no upstream call", async () => {
  const c = clientReturning(bigImage);
  const res = await handleGenerate(req({ image: { base64: 123, mimeType: true }, key: "k" }), c);
  expect(res.status).toBe(400);
  expect(((await res.json()) as any).error.code).toBe("bad_input");
  expect(c.calls()).toBe(0);
});
