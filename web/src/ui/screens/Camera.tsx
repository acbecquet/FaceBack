import { useEffect, useRef, useState } from "react";
import { startStream, stopStream, captureFrame, otherFacing, type Facing } from "../../units/camera";
import { Wordmark } from "../components/Wordmark";
import { GearIcon, PhotoIcon, SwitchCameraIcon } from "../icons";

// Remember the chosen camera across remounts (e.g. after a generation) so
// returning to the camera does not snap back to the back camera.
let sessionFacing: Facing = "environment";

export function Camera({ onCaptured, onOpenSettings }: { onCaptured: (blob: Blob) => void; onOpenSettings: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacingState] = useState<Facing>(sessionFacing);
  const setFacing = (f: Facing) => {
    sessionFacing = f;
    setFacingState(f);
  };
  const [err, setErr] = useState("");

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    startStream(facing)
      .then((s) => {
        if (cancelled) {
          stopStream(s);
          return;
        }
        stream = s;
        if (videoRef.current) {
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
    // Mirror the saved frame for the front camera so it matches the mirrored
    // preview below (what you frame is what you get).
    onCaptured(await captureFrame(videoRef.current, facing === "user"));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onCaptured(f);
  }

  return (
    <div style={{ height: "100%", width: "100%", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "var(--fb-bg)" }}>
      <div className="fb-topbar">
        <Wordmark size={17} />
        <span role="button" aria-label="Settings" onClick={onOpenSettings} style={{ cursor: "pointer", color: "var(--fb-muted)", display: "flex" }}>
          <GearIcon />
        </span>
      </div>
      <div style={{ flex: 1, position: "relative", background: "#14161a" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: facing === "user" ? "scaleX(-1)" : undefined }} />
        <div style={{ position: "absolute", top: 10, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 12 }}>
          {err || (facing === "user" ? "Front camera - tap switch for back" : "Back camera - tap switch for front")}
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label aria-label="Upload photo" style={{ color: "#fff", cursor: "pointer", display: "flex" }}>
            <PhotoIcon />
            <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
          </label>
          <button aria-label="Shutter" onClick={shoot} style={{ width: 64, height: 64, borderRadius: "50%", background: "#fff", border: "4px solid rgba(255,255,255,.5)" }} />
          <button aria-label="Switch camera" onClick={() => setFacing(otherFacing(facing))} style={{ color: "#fff", background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <SwitchCameraIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
