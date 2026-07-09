import { useEffect, useState } from "react";
import { keyApi, allowlistApi, shareApi, ApiError, type PublicAccount } from "../../units/apiClient";
import { BackIcon, KeyIcon, PersonIcon, SignOutIcon, LockIcon, TrashIcon, LinkIcon, CopyIcon, ClockIcon, ChevronIcon } from "../icons";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";

function onlyDigits(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

function fmtRemaining(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function describeError(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong. Try again.";
}

export function Settings({
  account,
  onBack,
  onSignedOut,
}: {
  account: PublicAccount;
  onBack: () => void;
  onSignedOut: () => void;
}) {
  const canManageKey = !account.usesDevKey || account.isDev;

  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState("");

  const [rowError, setRowError] = useState("");
  const [editToken, setEditToken] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [saved, setSaved] = useState(false);

  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [allowlistBusy, setAllowlistBusy] = useState(false);
  const [allowlistError, setAllowlistError] = useState("");

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState(0);
  const [shareRemaining, setShareRemaining] = useState(0);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (account.isDev) {
      void refreshAllowlist();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshAllowlist() {
    try {
      const result = await allowlistApi.list();
      setEmails(result.emails);
    } catch (e) {
      setAllowlistError(describeError(e));
    }
  }

  async function startKeyEdit() {
    setRowError("");
    setCodeError("");
    setCode("");
    setSaved(false);
    setCodeBusy(true);
    try {
      await keyApi.challenge();
      setCodeOpen(true);
    } catch (e) {
      setRowError(describeError(e));
    } finally {
      setCodeBusy(false);
    }
  }

  async function unlock() {
    setCodeError("");
    setCodeBusy(true);
    try {
      const result = await keyApi.reveal({ code });
      setApiKey(result.apiKey ?? "");
      setEditToken(result.editToken);
      setCodeOpen(false);
      setCode("");
    } catch (e) {
      setCodeError(describeError(e));
    } finally {
      setCodeBusy(false);
    }
  }

  function cancelCode() {
    setCodeOpen(false);
    setCode("");
    setCodeError("");
  }

  async function saveKey() {
    if (!editToken) return;
    setKeyBusy(true);
    setKeyError("");
    setSaved(false);
    try {
      await keyApi.edit({ apiKey, editToken });
      setSaved(true);
    } catch (e) {
      setKeyError(describeError(e));
    } finally {
      setKeyBusy(false);
    }
  }

  async function addEmail() {
    const email = newEmail.trim();
    if (!email) return;
    setAllowlistBusy(true);
    setAllowlistError("");
    try {
      await allowlistApi.add(email);
      setNewEmail("");
      await refreshAllowlist();
    } catch (e) {
      setAllowlistError(describeError(e));
    } finally {
      setAllowlistBusy(false);
    }
  }

  async function removeEmail(email: string) {
    setAllowlistBusy(true);
    setAllowlistError("");
    try {
      await allowlistApi.remove(email);
      await refreshAllowlist();
    } catch (e) {
      setAllowlistError(describeError(e));
    } finally {
      setAllowlistBusy(false);
    }
  }

  useEffect(() => {
    if (!shareUrl) return;
    const tick = () => setShareRemaining(Math.max(0, Math.round((shareExpiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [shareUrl, shareExpiresAt]);

  async function createShareLink() {
    if (shareBusy) return;
    setShareBusy(true);
    setShareError("");
    setCopied(false);
    try {
      const res = await shareApi.create();
      setShareUrl(res.url);
      setShareExpiresAt(Date.now() + res.expiresInSeconds * 1000);
    } catch (e) {
      setShareError(describeError(e));
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShareError("Could not copy - long-press the link to copy it.");
    }
  }

  const codeValid = code.length === 6;

  return (
    <div className="fb-screen">
      <div className="fb-topbar">
        <span role="button" aria-label="Back" onClick={onBack} style={{ cursor: "pointer", color: "var(--fb-blue)", display: "flex" }}>
          <BackIcon />
        </span>
        <strong>Settings</strong>
        <span style={{ width: 24 }} />
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <Row icon={<PersonIcon />} label={`@${account.username}`} trailing={account.email} />

        {canManageKey ? (
          <Row icon={<KeyIcon />} label="View / edit API key" trailing={<LockIcon />} onClick={startKeyEdit} />
        ) : (
          <Row icon={<KeyIcon />} label="Using the shared FaceBack key" />
        )}
        {rowError ? <div style={{ color: "#c0271b", fontSize: 13, padding: "0 16px 12px" }}>{rowError}</div> : null}

        {editToken !== null ? (
          <div style={{ padding: 16 }}>
            <TextField
              label="API key"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setSaved(false);
              }}
            />
            {keyError ? <div style={{ color: "#c0271b", fontSize: 13, marginBottom: 8 }}>{keyError}</div> : null}
            <Button disabled={keyBusy} onClick={saveKey}>
              {keyBusy ? "Saving..." : "Save key"}
            </Button>
            {saved ? <div style={{ color: "#1a7f37", fontSize: 12, marginTop: 6 }}>Saved.</div> : null}
          </div>
        ) : null}

        {account.isDev ? (
          <>
            <Row icon={<LinkIcon />} label="Create share link" trailing={<ChevronIcon />} onClick={createShareLink} />
            {shareError ? <div style={{ color: "#c0271b", fontSize: 13, padding: "0 16px 12px" }}>{shareError}</div> : null}
            {shareUrl ? (
              <div style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Share link</div>
                <TextField label="Anyone with this link is signed into your account" value={shareUrl} readOnly />
                <Button onClick={copyShareLink}>
                  <CopyIcon /> {copied ? "Copied" : "Copy link"}
                </Button>
                <div style={{ color: "var(--fb-muted)", fontSize: 12, marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <ClockIcon /> {shareRemaining > 0 ? `Expires in ${fmtRemaining(shareRemaining)}` : "Expired - create a new link"}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {account.isDev ? (
          <div style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Manage invites</div>
            {allowlistError ? <div style={{ color: "#c0271b", fontSize: 13, marginBottom: 8 }}>{allowlistError}</div> : null}
            {emails.map((email) => (
              <div
                key={email}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--fb-line)" }}
              >
                <span style={{ flex: 1 }}>{email}</span>
                <span
                  role="button"
                  aria-label={`Remove ${email}`}
                  onClick={() => !allowlistBusy && removeEmail(email)}
                  style={{ cursor: "pointer", color: "var(--fb-muted)", display: "flex" }}
                >
                  <TrashIcon />
                </span>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <TextField label="Add email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              <Button disabled={allowlistBusy || newEmail.trim() === ""} onClick={addEmail}>
                Add
              </Button>
            </div>
          </div>
        ) : null}

        <Row icon={<SignOutIcon />} label="Sign out" onClick={onSignedOut} />
      </div>

      {codeOpen ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, width: 260 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Enter the code we emailed you</div>
            <TextField
              label="Verification code"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(onlyDigits(e.target.value, 6))}
            />
            {codeError ? <div style={{ color: "#c0271b", fontSize: 13 }}>{codeError}</div> : null}
            <Button disabled={!codeValid || codeBusy} onClick={unlock}>
              {codeBusy ? "Unlocking..." : "Unlock"}
            </Button>
            <button className="fb-btn sec" style={{ marginTop: 8 }} onClick={cancelCode}>
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
