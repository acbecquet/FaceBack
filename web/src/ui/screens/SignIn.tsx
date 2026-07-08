import { useState } from "react";
import { authApi, ApiError, type PublicAccount } from "../../units/apiClient";
import { Wordmark } from "../components/Wordmark";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";

type Mode = "signin" | "create";

function onlyDigits(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

function describeError(e: unknown, isSignInRequest: boolean): string {
  if (e instanceof ApiError) {
    if (isSignInRequest && e.code === "no_account") {
      return "No account with that email or username.";
    }
    return e.message;
  }
  return "Something went wrong. Try again.";
}

export function SignIn({ onSignedIn }: { onSignedIn: (account: PublicAccount) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const identifierValid = identifier.trim() !== "";
  const createValid = username.trim() !== "" && email.includes("@");
  const codeValid = code.length === 6;

  function switchMode(next: Mode) {
    setMode(next);
    setSent(false);
    setCode("");
    setError("");
  }

  async function sendSignInCode() {
    setBusy(true);
    setError("");
    try {
      await authApi.request({ identifier: identifier.trim() });
      setSent(true);
    } catch (e) {
      setError(describeError(e, true));
    } finally {
      setBusy(false);
    }
  }

  async function sendSignUpCode() {
    setBusy(true);
    setError("");
    try {
      await authApi.signup({ username: username.trim(), email: email.trim() });
      setSent(true);
    } catch (e) {
      setError(describeError(e, false));
    } finally {
      setBusy(false);
    }
  }

  async function verify(identifierForVerify: string) {
    setBusy(true);
    setError("");
    try {
      const result = await authApi.verify({ identifier: identifierForVerify, code });
      onSignedIn(result.account);
    } catch (e) {
      setError(describeError(e, false));
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
        {mode === "signin" ? (
          <TextField
            label="Email or username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        ) : (
          <>
            <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </>
        )}

        {sent ? (
          <TextField
            label="Verification code"
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(onlyDigits(e.target.value, 6))}
          />
        ) : null}

        {error ? <div style={{ color: "#c0271b", fontSize: 13, marginBottom: 8 }}>{error}</div> : null}

        {!sent ? (
          mode === "signin" ? (
            <Button disabled={!identifierValid || busy} onClick={sendSignInCode}>
              {busy ? "Sending..." : "Send code"}
            </Button>
          ) : (
            <Button disabled={!createValid || busy} onClick={sendSignUpCode}>
              {busy ? "Sending..." : "Send code"}
            </Button>
          )
        ) : (
          <Button
            disabled={!codeValid || busy}
            onClick={() => verify(mode === "signin" ? identifier.trim() : email.trim())}
          >
            {busy ? "Verifying..." : "Verify"}
          </Button>
        )}

        {!sent ? (
          <button
            type="button"
            onClick={() => switchMode(mode === "signin" ? "create" : "signin")}
            style={{
              background: "none",
              border: "none",
              color: "var(--fb-blue)",
              fontSize: 13,
              cursor: "pointer",
              padding: 0,
              marginTop: 12,
              textAlign: "center",
              width: "100%",
            }}
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
