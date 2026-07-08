const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL_ID = "gemini-3.1-flash-image";

export interface GeneratedImage {
  imageBase64: string;
  mimeType: string;
}

export interface GeminiClient {
  generateImage(
    prompt: string,
    image: { base64: string; mimeType: string },
  ): Promise<GeneratedImage>;
}

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

// Extract the first image content block from an Interactions response. The API
// may return it as `output_image` or within `steps[].content[]`; handle both.
function extractImage(payload: any): GeneratedImage | null {
  const direct = payload?.output_image;
  if (direct?.data) return { imageBase64: direct.data, mimeType: direct.mime_type ?? "image/jpeg" };
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  for (const step of steps) {
    const blocks = Array.isArray(step?.content) ? step.content : [];
    for (const b of blocks) {
      if (b?.type === "image" && b?.data) {
        return { imageBase64: b.data, mimeType: b.mime_type ?? "image/jpeg" };
      }
    }
  }
  return null;
}

export function createGeminiClient(apiKey: string, fetchImpl: typeof fetch = fetch): GeminiClient {
  return {
    async generateImage(prompt, image) {
      const res = await fetchImpl(INTERACTIONS_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          model: MODEL_ID,
          input: [
            { type: "text", text: prompt },
            { type: "image", mime_type: image.mimeType, data: image.base64 },
          ],
          response_format: { type: "image", mime_type: "image/jpeg" },
        }),
      });
      if (!res.ok) throw new GeminiError(`Gemini request failed (${res.status})`, res.status);
      const img = extractImage(await res.json());
      if (!img) throw new GeminiError("Gemini returned no image", 502);
      return img;
    },
  };
}
