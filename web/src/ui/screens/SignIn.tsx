import { useState } from "react";
import { createAccount } from "../../units/auth";
import { createIndexedDbWrappingKeyStore } from "../../units/indexeddb";
import { Wordmark } from "../components/Wordmark";
import { TextField } from "../components/TextField";
import { PinInput } from "../components/PinInput";
import { Button } from "../components/Button";
import { EyeIcon } from "../icons";

export function SignIn({ onCreated }: { onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const valid =
    username.trim() !== "" &&
    email.includes("@") &&
    apiKey.trim() !== "" &&
    pin.length === 4 &&
    pin === confirm;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await createAccount({ username, email, apiKey, pin }, createIndexedDbWrappingKeyStore());
      onCreated();
    } catch {
      setError("Could not create your account. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fb-screen">
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 4, alignItems: "center", marginTop: 24 }}>
        <Wordmark size={30} />
        <div style={{ color: "var(--fb-muted)", fontSize: 13, textAlign: "center" }}>
          See the side of you that you never see.
        </div>
      </div>
      <div style={{ padding: "0 20px" }}>
        <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label="Nano Banana 2 key"
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          trailing={
            <span role="button" aria-label="Toggle key visibility" onClick={() => setShowKey((s) => !s)} style={{ cursor: "pointer", color: "var(--fb-muted)" }}>
              <EyeIcon />
            </span>
          }
        />
        <PinInput value={pin} onChange={setPin} label="Set a 4-digit PIN" />
        <PinInput value={confirm} onChange={setConfirm} label="Confirm PIN" />
        {error ? <div style={{ color: "#c0271b", fontSize: 13, marginBottom: 8 }}>{error}</div> : null}
        <Button disabled={!valid || busy} onClick={submit}>
          {busy ? "Creating..." : "Create account"}
        </Button>
        <div style={{ color: "var(--fb-muted)", fontSize: 11, textAlign: "center", marginTop: 12 }}>
          Stored on this device. Email is used only for PIN recovery.
        </div>
      </div>
    </div>
  );
}
