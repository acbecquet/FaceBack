import { Button } from "../components/Button";
import { DownloadIcon, RetryIcon } from "../icons";

export function Result({
  imageUrl,
  onSave,
  onRetry,
  onDiscard,
}: {
  imageUrl: string;
  onSave: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="fb-screen">
      <div className="fb-topbar"><strong>It's just the back of their head.</strong><span /></div>
      <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <img src={imageUrl} alt="the back of your head" style={{ width: "100%", borderRadius: 14, background: "var(--fb-card)" }} />
        <Button onClick={onSave}><DownloadIcon /> Save</Button>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={onRetry}><RetryIcon /> Retry</Button>
          <Button variant="secondary" onClick={onDiscard}>Discard</Button>
        </div>
      </div>
    </div>
  );
}
