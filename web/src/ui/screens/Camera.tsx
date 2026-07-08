import { useEffect, useRef, useState } from "react";
import { startStream, stopStream, captureFrame, otherFacing, type Facing } from "../../units/camera";
import { Wordmark } from "../components/Wordmark";
import { GearIcon, PhotoIcon, SwitchCameraIcon } from "../icons";

export function Camera({ onCaptured, onOpenSettings }: { onCaptured: (blob: Blob) => void; onOpenSettings: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [err, setErr] = useState("");

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    startStream(facing)
      .then((s) => {
        stream = s;
        if (!cancelled && videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
      })
      .catch(() => setErr("Camera unavailable. You can upload a photo instead."));
    return () => {
      cancelled = true;
      if (stream) stopStream(stream);
    };
  }, [facing]);

  async function shoot() {
    if (!videoRef.current || !videoRef.current.videoWidth) return;
    onCaptured(await captureFrame(videoRef.current));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onCaptured(f);
  }

  return (
    <div className="fb-screen">
      <div className="fb-topbar">
        <Wordmark size={17} />
        <span role="button" aria-label="Settings" onClick={onOpenSettings} style={{ cursor: "pointer", color: "var(--fb-muted)", display: "flex" }}>
          <GearIcon />
        </span>
      </div>
      <div style={{ flex: 1, position: "relative", background: "#14161a" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 10, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 12 }}>
          {err || "Back camera - tap switch for front"}
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label aria-label="Upload photo" style={{ color: "#fff", cursor: "pointer", display: "flex" }}>
            <PhotoIcon />
            <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
          </label>
          <button aria-label="Shutter" onClick={shoot} style={{ width: 64, height: 64, borderRadius: "50%", background: "#fff", border: "4px solid rgba(255,255,255,.5)" }} />
          <button aria-label="Switch camera" onClick={() => setFacing((f) => otherFacing(f))} style={{ color: "#fff", background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <SwitchCameraIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
