import { useEffect, useState } from "react";
import "./theme.css";
import { meApi, authApi, type PublicAccount } from "./units/apiClient";
import { downscaleImage, base64ToBlob } from "./units/imageUtil";
import { detectFaces } from "./units/faceGate";
import { generateBackOfHead, GenerationRequestError } from "./units/generationClient";
import { loadHistory, saveHistory } from "./units/usageGuard";
import { addItem } from "./units/collection";
import { saveImageToDevice } from "./units/export";
import { runGeneration, FlowError, type Screen } from "./ui/flow";
import { SignIn } from "./ui/screens/SignIn";
import { AddKey } from "./ui/screens/AddKey";
import { Camera } from "./ui/screens/Camera";
import { Generating } from "./ui/screens/Generating";
import { Result } from "./ui/screens/Result";
import { Collection } from "./ui/screens/Collection";
import { Settings } from "./ui/screens/Settings";

function makeDeps() {
  return {
    now: Date.now(),
    history: loadHistory(),
    downscale: downscaleImage,
    detectInput: async (b: Blob) => detectFaces(await createImageBitmap(b)),
    generate: (a: { image: { base64: string; mimeType: string } }) => generateBackOfHead(a),
    detectOutput: async (b: Blob) => detectFaces(await createImageBitmap(b)),
    toBlob: base64ToBlob,
    saveUsage: saveHistory,
  };
}

function messageFor(e: unknown): string {
  if (e instanceof FlowError) {
    if (e.code === "too_soon") return "Please wait a moment before generating again.";
    if (e.code === "daily_cap") return "You have reached today's generation limit.";
    if (e.code === "no_face") return "No face detected - try another photo.";
    return "Could not generate. Try again.";
  }
  if (e instanceof GenerationRequestError) {
    if (e.code === "daily_limit") return "Daily limit reached. Try again tomorrow.";
    return e.message;
  }
  return "Something went wrong. Try again.";
}

export default function App() {
  const [account, setAccount] = useState<PublicAccount | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>("camera");
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");

  async function refreshMe() {
    setAccount(await meApi.get());
  }

  useEffect(() => {
    void refreshMe();
  }, []);

  async function handleCapture(blob: Blob) {
    setScreen("generating");
    setError("");
    try {
      const gen = await runGeneration({ blob }, makeDeps());
      const outBlob = base64ToBlob(gen.base64, gen.mimeType);
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { blob: outBlob, url: URL.createObjectURL(outBlob) };
      });
      setScreen("result");
      try {
        await addItem({
          id: crypto.randomUUID(),
          imageBlob: outBlob,
          mimeType: gen.mimeType,
          width: 0,
          height: 0,
          createdAt: new Date().toISOString(),
        });
      } catch {
        // keep the result visible even if the collection write fails
      }
    } catch (e) {
      if (e instanceof GenerationRequestError && e.code === "unauthorized") {
        setAccount(null);
        setScreen("camera");
        return;
      }
      if (e instanceof GenerationRequestError && e.code === "no_key") {
        await refreshMe();
        setScreen("camera");
        return;
      }
      setError(messageFor(e));
      setScreen("camera");
    }
  }

  function discardResult() {
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setScreen("camera");
  }

  if (account === undefined) {
    return (
      <div
        role="status"
        aria-label="Loading"
        style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--fb-bg)" }}
      >
        <div
          className="fb-spinner"
          style={{ width: 36, height: 36, borderRadius: "50%", border: "4px solid #e7eaee", borderTopColor: "var(--fb-blue)", animation: "fbspin 1s linear infinite" }}
        />
        <style>{"@keyframes fbspin{to{transform:rotate(360deg)}}"}</style>
      </div>
    );
  }

  if (account === null) {
    return <SignIn onSignedIn={setAccount} />;
  }

  if (!account.hasOwnKey && !account.usesDevKey) {
    return <AddKey onDone={refreshMe} />;
  }

  if (screen === "generating") {
    return <Generating />;
  }

  if (screen === "result" && result) {
    return (
      <Result
        imageUrl={result.url}
        onSave={() => saveImageToDevice(result.blob, "faceback-back-of-head.jpg")}
        onRetry={discardResult}
        onDiscard={discardResult}
      />
    );
  }

  if (screen === "collection") {
    return <Collection onBack={() => setScreen("camera")} />;
  }

  if (screen === "settings") {
    return (
      <Settings
        account={account}
        onBack={() => setScreen("camera")}
        onSignedOut={async () => {
          await authApi.logout();
          setAccount(null);
          setScreen("camera");
        }}
      />
    );
  }

  return (
    <div style={{ height: "100dvh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--fb-bg)" }}>
      {error ? (
        <div style={{ background: "#c0271b", color: "#fff", padding: "8px 14px", fontSize: 13, textAlign: "center" }}>{error}</div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <Camera onCaptured={handleCapture} onOpenSettings={() => { setError(""); setScreen("settings"); }} />
      </div>
      <div style={{ display: "flex", borderTop: "1px solid var(--fb-line)", background: "var(--fb-card)" }}>
        <button className="fb-btn sec" style={{ borderRadius: 0, border: "none" }} onClick={() => { setError(""); setScreen("camera"); }}>
          Camera
        </button>
        <button className="fb-btn sec" style={{ borderRadius: 0, border: "none" }} onClick={() => { setError(""); setScreen("collection"); }}>
          Your Backs
        </button>
      </div>
    </div>
  );
}
