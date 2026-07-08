export type FaceGateResult = { supported: boolean; faceCount: number };

export async function detectFaces(source: CanvasImageSource): Promise<FaceGateResult> {
  const Detector = (globalThis as any).FaceDetector;
  if (typeof Detector !== "function") return { supported: false, faceCount: 0 };
  try {
    const detector = new Detector();
    const faces = await detector.detect(source);
    return { supported: true, faceCount: Array.isArray(faces) ? faces.length : 0 };
  } catch {
    // A detector that throws is treated as unsupported (degrade open).
    return { supported: false, faceCount: 0 };
  }
}

// INPUT gate: allow when a face is present, or when detection is unavailable
// (degrade open so users on browsers without FaceDetector are not blocked).
export function hasDetectableFace(result: FaceGateResult): boolean {
  return !result.supported || result.faceCount > 0;
}

// OUTPUT suspicion heuristic for the hybrid loop: a correct back-of-head result
// should have NO detectable face. A detected face means "suspicious, regenerate".
export function looksLikeBackOfHead(result: FaceGateResult): boolean {
  return !result.supported || result.faceCount === 0;
}
