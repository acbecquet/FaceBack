import { generateBackOfHead, GenerationRequestError } from "./generationClient";

function fetchReturning(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

test("posts only the image (no apiKey) with credentials included, and returns the result image", async () => {
  const captured: { url?: string; init?: RequestInit } = {};
  const spy = (async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return new Response(JSON.stringify({ image: { base64: "OUT", mimeType: "image/jpeg" } }), {
      status: 200,
    });
  }) as unknown as typeof fetch;

  const out = await generateBackOfHead({ image: { base64: "IN", mimeType: "image/png" } }, spy);

  expect(out).toEqual({ base64: "OUT", mimeType: "image/jpeg" });
  expect(captured.url).toContain("/generate");
  expect(captured.init!.credentials).toBe("include");
  const body = JSON.parse(captured.init!.body as string);
  expect(body).toEqual({ image: { base64: "IN", mimeType: "image/png" } });
});

test("throws GenerationRequestError carrying the server error code", async () => {
  const spy = fetchReturning({ error: { code: "generation_failed", message: "x" } }, 502);
  const err = await generateBackOfHead(
    { image: { base64: "IN", mimeType: "image/png" } },
    spy,
  ).catch((e) => e);
  expect(err).toBeInstanceOf(GenerationRequestError);
  expect(err.code).toBe("generation_failed");
});

test("a 429 daily_limit response throws GenerationRequestError with that code", async () => {
  const spy = fetchReturning(
    { error: { code: "daily_limit", message: "Daily limit reached. Try again tomorrow." } },
    429,
  );
  const err = await generateBackOfHead(
    { image: { base64: "IN", mimeType: "image/png" } },
    spy,
  ).catch((e) => e);
  expect(err).toBeInstanceOf(GenerationRequestError);
  expect(err.code).toBe("daily_limit");
});
