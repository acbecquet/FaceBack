import { generateBackOfHead, GenerationRequestError } from "./generationClient";

function fetchReturning(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

test("posts the image and key and returns the result image", async () => {
  const captured: { url?: string; init?: RequestInit } = {};
  const spy = (async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return new Response(JSON.stringify({ image: { base64: "OUT", mimeType: "image/jpeg" } }), {
      status: 200,
    });
  }) as unknown as typeof fetch;

  const out = await generateBackOfHead(
    { image: { base64: "IN", mimeType: "image/png" }, apiKey: "sk" },
    spy,
  );

  expect(out).toEqual({ base64: "OUT", mimeType: "image/jpeg" });
  expect(captured.url).toContain("/generate");
  const body = JSON.parse(captured.init!.body as string);
  expect(body).toEqual({ image: { base64: "IN", mimeType: "image/png" }, key: "sk" });
});

test("throws GenerationRequestError carrying the server error code", async () => {
  const spy = fetchReturning({ error: { code: "generation_failed", message: "x" } }, 502);
  const err = await generateBackOfHead(
    { image: { base64: "IN", mimeType: "image/png" }, apiKey: "sk" },
    spy,
  ).catch((e) => e);
  expect(err).toBeInstanceOf(GenerationRequestError);
  expect(err.code).toBe("generation_failed");
});
