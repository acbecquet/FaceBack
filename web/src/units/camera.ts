export type Facing = "environment" | "user";

export function otherFacing(f: Facing): Facing {
  return f === "environment" ? "user" : "environment";
}

export function startStream(
  facing: Facing,
  md: MediaDevices = navigator.mediaDevices,
): Promise<MediaStream> {
  return md.getUserMedia({ video: { facingMode: facing }, audio: false });
}

export function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

// Browser-only: draw the current video frame to a canvas and return a JPEG blob.
// Verified in the Plan 4 browser run. `mirror` flips horizontally so the saved
// frame matches a mirrored (selfie) preview - what you frame is what you get.
export async function captureFrame(video: HTMLVideoElement, mirror = false): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92),
  );
}
