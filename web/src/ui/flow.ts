import { decide, record } from "../units/usageGuard";
import { hasDetectableFace, looksLikeBackOfHead, type FaceGateResult } from "../units/faceGate";

export type Screen = "signin" | "camera" | "generating" | "result" | "collection" | "settings";

export class FlowError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "FlowError";
    this.code = code;
  }
}

export interface GenerationDeps {
  now: number;
  history: number[];
  downscale: (b: Blob) => Promise<{ base64: string; mimeType: string; width: number; height: number }>;
  detectInput: (b: Blob) => Promise<FaceGateResult>;
  generate: (input: { image: { base64: string; mimeType: string }; apiKey: string }) => Promise<{
    base64: string;
    mimeType: string;
  }>;
  detectOutput: (b: Blob) => Promise<FaceGateResult>;
  toBlob: (base64: string, mimeType: string) => Blob;
  saveUsage: (history: number[]) => void;
}

export async function runGeneration(
  input: { blob: Blob; apiKey: string },
  deps: GenerationDeps,
): Promise<{ base64: string; mimeType: string }> {
  const gate = decide(deps.now, deps.history);
  if (!gate.allowed) throw new FlowError(gate.reason ?? "blocked", "Generation not allowed right now");

  if (!hasDetectableFace(await deps.detectInput(input.blob))) {
    throw new FlowError("no_face", "No face detected in the photo");
  }

  const small = await deps.downscale(input.blob);
  const image = { base64: small.base64, mimeType: small.mimeType };

  let result = await deps.generate({ image, apiKey: input.apiKey });
  // Client-side hybrid: if a face is detected in the result, regenerate ONCE.
  if (!looksLikeBackOfHead(await deps.detectOutput(deps.toBlob(result.base64, result.mimeType)))) {
    result = await deps.generate({ image, apiKey: input.apiKey });
  }

  deps.saveUsage(record(deps.now, deps.history));
  return result;
}
