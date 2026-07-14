import { Button } from "../components/Button";
import { DownloadIcon, RetryIcon } from "../icons";

export function Result({
  originalUrl,
  imageUrl,
  onSave,
  onRetry,
  onDiscard,
}: {
  originalUrl: string;
  imageUrl: string;
  onSave: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="fb-screen">
      <div className="fb-topbar"><strong>It's just the back of their head.</strong><span /></div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "start" }}>
          <figure style={{ margin: 0 }}>
            <img src={originalUrl} alt="the original photo" style={{ width: "100%", borderRadius: 14, background: "var(--fb-card)", display: "block" }} />
            <figcaption style={{ textAlign: "center", fontSize: 12, color: "var(--fb-muted)", marginTop: 6 }}>Original</figcaption>
          </figure>
          <figure style={{ margin: 0 }}>
            <img src={imageUrl} alt="the back of their head" style={{ width: "100%", borderRadius: 14, background: "var(--fb-card)", display: "block" }} />
            <figcaption style={{ textAlign: "center", fontSize: 12, color: "var(--fb-muted)", marginTop: 6 }}>Back</figcaption>
          </figure>
        </div>
        <Button onClick={onSave}><DownloadIcon /> Save</Button>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={onRetry}><RetryIcon /> Retry</Button>
          <Button variant="secondary" onClick={onDiscard}>Discard</Button>
        </div>
      </div>
    </div>
  );
}
