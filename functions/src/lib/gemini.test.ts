import { createGeminiClient, GeminiError } from "./gemini";

function fakeFetch(response: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(response), { status })) as unknown as typeof fetch;
}

test("generateImage posts to the Interactions API and returns the image block", async () => {
  const captured: { url?: string; init?: RequestInit } = {};
  const spyFetch = (async (url: string, init: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return new Response(
      JSON.stringify({ output_image: { mime_type: "image/jpeg", data: "AAAA" } }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const client = createGeminiClient("test-key", spyFetch);
  const out = await client.generateImage("do the thing", { base64: "BBBB", mimeType: "image/png" });

  expect(out).toEqual({ imageBase64: "AAAA", mimeType: "image/jpeg" });
  expect(captured.url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
  const headers = new Headers(captured.init!.headers);
  expect(headers.get("x-goog-api-key")).toBe("test-key");
  const body = JSON.parse(captured.init!.body as string);
  expect(body.model).toBe("gemini-3.1-flash-image");
  expect(body.input).toEqual([
    { type: "text", text: "do the thing" },
    { type: "image", mime_type: "image/png", data: "BBBB" },
  ]);
  expect(body.response_format.type).toBe("image");
});

test("a non-2xx response throws GeminiError with the status", async () => {
  const client = createGeminiClient("k", fakeFetch({ error: "nope" }, 429));
  await expect(client.generateImage("p", { base64: "x", mimeType: "image/png" })).rejects.toMatchObject(
    { name: "GeminiError", status: 429 },
  );
});

test("a 2xx response with no image block throws GeminiError", async () => {
  const client = createGeminiClient("k", fakeFetch({ output_image: null }, 200));
  await expect(client.generateImage("p", { base64: "x", mimeType: "image/png" })).rejects.toBeInstanceOf(
    GeminiError,
  );
});
