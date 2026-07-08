import { useState } from "react";
import "./theme.css";
import { getAccount } from "./units/auth";
import { revealApiKey } from "./units/auth";
import { createIndexedDbWrappingKeyStore } from "./units/indexeddb";
import { downscaleImage, base64ToBlob } from "./units/imageUtil";
import { detectFaces } from "./units/faceGate";
import { generateBackOfHead, GenerationRequestError } from "./units/generationClient";
import { loadHistory, saveHistory } from "./units/usageGuard";
import { addItem } from "./units/collection";
import { saveImageToDevice } from "./units/export";
import { runGeneration, FlowError, type Screen } from "./ui/flow";
import { SignIn } from "./ui/screens/SignIn";
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
    generate: (a: { image: { base64: string; mimeType: string }; apiKey: string }) => generateBackOfHead(a),
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
  if (e instanceof GenerationRequestError) return e.message;
  return "Something went wrong. Try again.";
}

export default function App() {
  const [account, setAccount] = useState(() => getAccount());
  const [screen, setScreen] = useState<Screen>("camera");
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");

  if (!account) {
    // NOTE(task-3): SignIn now speaks the hosted passwordless PublicAccount
    // model, which does not match this screen's local-device Account type.
    // Task 4 rewires App.tsx to consume PublicAccount end-to-end; for now we
    // only keep this call site compiling by falling back to the existing
    // local getAccount() re-read.
    return <SignIn onSignedIn={() => setAccount(getAccount())} />;
  }

  async function handleCapture(blob: Blob) {
    setScreen("generating");
    setError("");
    try {
      const apiKey = await revealApiKey(createIndexedDbWrappingKeyStore());
      const gen = await runGeneration({ blob, apiKey }, makeDeps());
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
    return <Settings onBack={() => setScreen("camera")} onSignedOut={() => setAccount(null)} />;
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
