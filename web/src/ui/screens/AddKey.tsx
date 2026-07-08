import { useState } from "react";
import { keyApi, ApiError } from "../../units/apiClient";
import { Wordmark } from "../components/Wordmark";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { EyeIcon } from "../icons";

export function AddKey({ onDone }: { onDone: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const valid = apiKey.trim() !== "";

  async function save() {
    setBusy(true);
    setError("");
    try {
      await keyApi.setInitial({ apiKey: apiKey.trim() });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fb-screen">
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 4, alignItems: "center", marginTop: 24 }}>
        <Wordmark size={30} />
        <div style={{ color: "var(--fb-muted)", fontSize: 13, textAlign: "center" }}>
          Add your Nano Banana 2 / Gemini key to start generating.
        </div>
      </div>
      <div style={{ padding: "0 20px" }}>
        <TextField
          label="Nano Banana 2 key"
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          trailing={
            <span
              role="button"
              aria-label="Toggle key visibility"
              onClick={() => setShowKey((s) => !s)}
              style={{ cursor: "pointer", color: "var(--fb-muted)" }}
            >
              <EyeIcon />
            </span>
          }
        />
        {error ? <div style={{ color: "#c0271b", fontSize: 13, marginBottom: 8 }}>{error}</div> : null}
        <Button disabled={!valid || busy} onClick={save}>
          {busy ? "Saving..." : "Save key"}
        </Button>
      </div>
    </div>
  );
}
