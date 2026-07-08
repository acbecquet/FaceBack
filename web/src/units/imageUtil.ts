import { config } from "./config";

export function computeScaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

// Browser-only: draws the image to a canvas at the downscaled size and returns
// JPEG base64. jsdom cannot execute canvas rendering, so this path is verified
// in the Plan 4 browser run; the size math above is unit-tested.
export async function downscaleImage(
  blob: Blob,
  maxEdge: number = config.MAX_IMAGE_EDGE,
): Promise<{ base64: string; mimeType: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = computeScaledSize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const outBlob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9),
  );
  return { base64: await blobToBase64(outBlob), mimeType: "image/jpeg", width, height };
}
