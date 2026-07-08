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

type ResultImage = { base64: string; mimeType: string };

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
  const [account, setAccount] = useState(getAccount());
  const [screen, setScreen] = useState<Screen>("camera");
  const [resultImage, setResultImage] = useState<ResultImage | null>(null);
  const [error, setError] = useState("");

  if (!account) {
    return <SignIn onCreated={() => setAccount(getAccount())} />;
  }

  async function handleCapture(blob: Blob) {
    setScreen("generating");
    setError("");
    try {
      const apiKey = await revealApiKey(createIndexedDbWrappingKeyStore());
      const result = await runGeneration({ blob, apiKey }, makeDeps());
      await addItem({
        id: crypto.randomUUID(),
        imageBlob: base64ToBlob(result.base64, result.mimeType),
        mimeType: result.mimeType,
        width: 0,
        height: 0,
        createdAt: new Date().toISOString(),
      });
      setResultImage(result);
      setScreen("result");
    } catch (e) {
      setError(messageFor(e));
      setScreen("camera");
    }
  }

  if (screen === "generating") {
    return <Generating />;
  }

  if (screen === "result" && resultImage) {
    const url = URL.createObjectURL(base64ToBlob(resultImage.base64, resultImage.mimeType));
    return (
      <Result
        imageUrl={url}
        onSave={() => saveImageToDevice(base64ToBlob(resultImage.base64, resultImage.mimeType), "faceback-back-of-head.jpg")}
        onRetry={() => setScreen("camera")}
        onDiscard={() => setScreen("camera")}
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
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {error ? (
        <div style={{ background: "#c0271b", color: "#fff", padding: "8px 14px", fontSize: 13, textAlign: "center" }}>
          {error}
        </div>
      ) : null}
      <div style={{ flex: 1 }}>
        <Camera onCaptured={handleCapture} onOpenSettings={() => setScreen("settings")} />
      </div>
      <div style={{ display: "flex", borderTop: "1px solid var(--fb-line)", background: "var(--fb-card)" }}>
        <button className="fb-btn sec" style={{ borderRadius: 0, border: "none" }} onClick={() => setScreen("camera")}>
          Camera
        </button>
        <button className="fb-btn sec" style={{ borderRadius: 0, border: "none" }} onClick={() => setScreen("collection")}>
          Your Backs
        </button>
      </div>
    </div>
  );
}
