import { useState } from "react";
import { getAccount, verifyAccountPin, revealApiKey, updateApiKey, signOut } from "../../units/auth";
import { createIndexedDbWrappingKeyStore } from "../../units/indexeddb";
import { BackIcon, KeyIcon, PersonIcon, SignOutIcon, LockIcon } from "../icons";
import { PinInput } from "../components/PinInput";
import { Button } from "../components/Button";

export function Settings({ onBack, onSignedOut }: { onBack: () => void; onSignedOut: () => void }) {
  const account = getAccount();
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saved, setSaved] = useState(false);

  async function unlock() {
    setError("");
    if (!(await verifyAccountPin(pin))) {
      setError("Incorrect PIN");
      return;
    }
    const key = await revealApiKey(createIndexedDbWrappingKeyStore());
    setRevealed(key);
    setEditValue(key);
    setPinOpen(false);
    setPin("");
  }

  async function doSignOut() {
    await signOut();
    onSignedOut();
  }

  return (
    <div className="fb-screen">
      <div className="fb-topbar">
        <span role="button" aria-label="Back" onClick={onBack} style={{ cursor: "pointer", color: "var(--fb-blue)", display: "flex" }}>
          <BackIcon />
        </span>
        <strong>Settings</strong>
        <span style={{ width: 24 }} />
      </div>
      <div style={{ flex: 1 }}>
        <Row icon={<PersonIcon />} label={`Account - @${account?.username ?? ""}`} />
        <Row icon={<KeyIcon />} label="Edit API key" trailing={<LockIcon />} onClick={() => { setPinOpen(true); setRevealed(null); }} />
        {revealed !== null ? (
          <div style={{ padding: 16 }}>
            <input
              aria-label="API key"
              value={editValue}
              onChange={(e) => { setEditValue(e.target.value); setSaved(false); }}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--fb-line)" }}
            />
            <button className="fb-btn" style={{ marginTop: 8 }} onClick={async () => { await updateApiKey(editValue, createIndexedDbWrappingKeyStore()); setSaved(true); }}>
              Save key
            </button>
            {saved ? <div style={{ color: "#1a7f37", fontSize: 12, marginTop: 6 }}>Saved.</div> : null}
          </div>
        ) : null}
        <Row icon={<SignOutIcon />} label="Sign out" onClick={doSignOut} />
      </div>
      {pinOpen ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: 260 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Enter PIN</div>
            <PinInput value={pin} onChange={setPin} label="Enter PIN" />
            {error ? <div style={{ color: "#c0271b", fontSize: 13 }}>{error}</div> : null}
            <Button onClick={unlock}>Unlock</Button>
            <button className="fb-btn sec" style={{ marginTop: 8 }} onClick={() => { setPinOpen(false); setPin(""); setError(""); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ icon, label, trailing, onClick }: { icon: React.ReactNode; label: string; trailing?: React.ReactNode; onClick?: () => void }) {
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? "button" : undefined}
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, background: "var(--fb-card)", borderBottom: "1px solid var(--fb-line)", cursor: clickable ? "pointer" : "default" }}
    >
      <span style={{ color: "var(--fb-muted)", display: "flex" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {trailing ? <span style={{ color: "var(--fb-muted)", display: "flex" }}>{trailing}</span> : null}
    </div>
  );
}
