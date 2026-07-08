import { Wordmark } from "../components/Wordmark";

export function Generating() {
  return (
    <div className="fb-screen">
      <div className="fb-topbar"><Wordmark size={17} /><span /></div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div className="fb-spinner" style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid #e7eaee", borderTopColor: "var(--fb-blue)", animation: "fbspin 1s linear infinite" }} />
        <div style={{ fontWeight: 700 }}>Generating the back of your head...</div>
        <div style={{ color: "var(--fb-muted)", fontSize: 12 }}>usually about 5-10 seconds</div>
        <style>{"@keyframes fbspin{to{transform:rotate(360deg)}}"}</style>
      </div>
    </div>
  );
}
