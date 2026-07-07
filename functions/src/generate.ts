import { BACK_OF_HEAD_PROMPT } from "./lib/prompt";
import { GeminiError, type GeminiClient, type GeneratedImage } from "./lib/gemini";
import { json, errorResponse } from "./lib/http";

// A plausible image is at least this many base64 chars (guards against empty or
// degenerate model output). Real JPEG/PNG output is far larger; this only rules
// out blanks and error stubs.
const MIN_IMAGE_BASE64 = 100;

function isPlausible(img: GeneratedImage): boolean {
  return typeof img.imageBase64 === "string" && img.imageBase64.length >= MIN_IMAGE_BASE64;
}

export async function handleGenerate(
  req: Request,
  deps: { makeClient: (apiKey: string) => GeminiClient },
): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("bad_input", "Body must be JSON", 400);
  }
  const image = body?.image;
  const key = body?.key;
  if (
    typeof image?.base64 !== "string" ||
    !image.base64 ||
    typeof image?.mimeType !== "string" ||
    !image.mimeType ||
    typeof key !== "string" ||
    !key
  ) {
    return errorResponse("bad_input", "Expected { image: { base64, mimeType }, key }", 400);
  }

  const client = deps.makeClient(key);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await client.generateImage(BACK_OF_HEAD_PROMPT, {
        base64: image.base64,
        mimeType: image.mimeType,
      });
      if (isPlausible(out)) {
        return json({ image: { base64: out.imageBase64, mimeType: out.mimeType } });
      }
    }
    return errorResponse("generation_failed", "Could not produce a valid image", 502);
  } catch (err) {
    if (err instanceof GeminiError) {
      const status = err.status === 429 ? 429 : 502;
      return errorResponse("gemini_error", err.message, status);
    }
    return errorResponse("internal_error", "Unexpected error", 500);
  }
}
