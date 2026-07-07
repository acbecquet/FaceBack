import { config } from "./config";

export class GenerationRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GenerationRequestError";
    this.code = code;
  }
}

export async function generateBackOfHead(
  params: { image: { base64: string; mimeType: string }; apiKey: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ base64: string; mimeType: string }> {
  const res = await fetchImpl(`${config.FUNCTIONS_BASE_URL}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: params.image, key: params.apiKey }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error?.code ?? "request_failed";
    const message = data?.error?.message ?? `Request failed (${res.status})`;
    throw new GenerationRequestError(code, message);
  }
  return data.image;
}
