# FaceBack Phase 1 - Plan 4: UI (screens, skin, navigation, wiring) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble the tested units into the runnable FaceBack web app: the six screens in the approved skin, navigation, first-run gating, and the full capture -> generate -> save flow, plus the deferred storage-of-record fix.

**Architecture:** React function components under `web/src/ui/`, styled with a small design-token stylesheet (`theme.css`) matching the approved mockups (Facebook-parody blue, wordmark only, SF-Symbols-style line icons). A single `App` holds a screen enum and the signed-in/first-run state; there is no router library (YAGNI) - navigation is state. Logic lives in the Plan 1-3 units; components are thin. Component logic that can be tested (reducers, form validation, selection state) is unit-tested with React Testing Library; the camera/generation visual flow is validated by running the dev server (this plan) and by the user end-to-end (real camera + Gemini key).

**Tech Stack:** React 18, Vite, TypeScript, Vitest + React Testing Library (already set up), the Plan 1-3 units.

## Global Constraints

Copied from `docs/superpowers/specs/2026-07-07-faceback-design.md` and the approved plan artifact.

- Branding: the "FaceBack" text wordmark only, NO logo symbol. Facebook-parody blue `#1877F2`. Modern, flat, SF-Symbols-style line icons (no emoji in the product UI).
- Screens: (1) Sign in / create account, (2) Camera (back default + front toggle + upload), (3) Generating, (4) Result, (5) Collection "Your Backs", (6) Settings.
- Result header copy verbatim: `It's just the back of their head.`
- Camera opens on the back camera by default with a switch to front.
- Every generated result is auto-added to the in-app collection; Save additionally exports to the device.
- PIN is never asked in normal use; only at account creation and to reveal/edit the key in Settings.
- Collection supports select + multi-delete.
- Copy uses plain hyphens, never the em dash character.

## File structure (Plan 4 additions)

```
web/src/
  theme.css                       # design tokens + base component styles
  ui/
    icons.tsx                     # SF-style line-icon React components
    components/
      Button.tsx  TextField.tsx  PinInput.tsx  Wordmark.tsx
    screens/
      SignIn.tsx    SignIn.test.tsx
      Camera.tsx
      Generating.tsx
      Result.tsx
      Collection.tsx  Collection.test.tsx
      Settings.tsx    Settings.test.tsx
    flow.ts          flow.test.ts # pure screen-state reducer + the generation flow orchestration
  App.tsx (rewritten)             # shell: first-run gating + screen switch + nav
```

Task ordering builds foundations first (storage fix, skin, shell), then screens, then a dev-server visual pass.

---

### Task 1: Storage-of-record fix - move the encrypted key blob into IndexedDB

**Files:**
- Modify: `web/src/units/indexeddb.ts`, `web/src/units/auth.ts`, `web/src/units/auth.test.ts`
- Test: `web/src/units/indexeddb.test.ts` (extend)

**Interfaces (deferred from Plan 1 whole-branch review):**
- The `WrappedKeyRecord` ciphertext moves from `localStorage` into the keystore's `faceback` IndexedDB (shared fate with its wrapping key). `auth` gains `hasStoredKey(): Promise<boolean>`. `signOut` becomes `async` and clears the wrapping key + wrapped record from IndexedDB in addition to the localStorage account.
- Produces on `indexeddb.ts`: `getWrappedRecord(): Promise<WrappedKeyRecord | null>`, `setWrappedRecord(rec): Promise<void>`, `clearKeystore(): Promise<void>` (clears the whole `keys` store).

- [ ] **Step 1: Write the failing tests**

Add to `web/src/units/indexeddb.test.ts`:

```ts
import {
  createIndexedDbWrappingKeyStore,
  getWrappedRecord,
  setWrappedRecord,
  clearKeystore,
} from "./indexeddb";

test("the wrapped-key record round-trips through IndexedDB and clearKeystore removes it", async () => {
  await setWrappedRecord({ ciphertext: "ct", iv: "iv" });
  expect(await getWrappedRecord()).toEqual({ ciphertext: "ct", iv: "iv" });
  await clearKeystore();
  expect(await getWrappedRecord()).toBeNull();
});
```

Update `web/src/units/auth.test.ts` so account creation stores the record in IndexedDB, `hasStoredKey` reflects it, and `signOut` clears it (replace the relevant assertions that referenced localStorage for the wrapped key):

```ts
import { hasStoredKey } from "./auth";

test("createAccount stores the wrapped key in IndexedDB and hasStoredKey is true", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  expect(localStorage.getItem("faceback.wrappedKey")).toBeNull(); // no longer in localStorage
  await expect(hasStoredKey()).resolves.toBe(true);
});

test("signOut clears the account and the stored key", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  await signOut();
  expect(getAccount()).toBeNull();
  await expect(hasStoredKey()).resolves.toBe(false);
});
```

(Update the existing `revealApiKey` test to read from the IndexedDB record; keep passing the same `createMemoryWrappingKeyStore()` instance.)

- [ ] **Step 2: Run to see the new assertions fail**

Run: `cd web && npx vitest run src/units/indexeddb.test.ts src/units/auth.test.ts`
Expected: FAIL - `getWrappedRecord`/`hasStoredKey` not exported; `signOut` still sync.

- [ ] **Step 3: Add the record accessors to indexeddb.ts**

Append to `web/src/units/indexeddb.ts` (reuse the existing `openDb`/`tx`; the `keys` store already exists):

```ts
import type { WrappedKeyRecord } from "../types";

const WRAPPED_ID = "wrappedKey";

export async function getWrappedRecord(): Promise<WrappedKeyRecord | null> {
  const v = await tx<WrappedKeyRecord | undefined>("readonly", (s) => s.get(WRAPPED_ID));
  return v ?? null;
}

export async function setWrappedRecord(rec: WrappedKeyRecord): Promise<void> {
  await tx("readwrite", (s) => s.put(rec, WRAPPED_ID));
}

export async function clearKeystore(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
}
```

- [ ] **Step 4: Move auth to the IndexedDB record**

In `web/src/units/auth.ts`: remove the `WRAPPED_KEY` localStorage usage; import `getWrappedRecord`, `setWrappedRecord`, `clearKeystore` from `./indexeddb`. `createAccount` writes the wrapped record via `setWrappedRecord` (write it BEFORE the localStorage account so `isSignedIn` only flips true once the key is persisted). `revealApiKey` reads via `getWrappedRecord` (throw a clear error if absent). Add `hasStoredKey`. Make `signOut` async and clear both stores:

```ts
export async function createAccount(
  input: { username: string; email: string; apiKey: string; pin: string },
  store: WrappingKeyStore,
): Promise<Account> {
  const { hash, salt } = await hashPin(input.pin);
  const wrapped = await wrapApiKey(store, input.apiKey);
  await setWrappedRecord(wrapped); // persist the key first
  const account: Account = {
    username: input.username,
    email: input.email,
    pinHash: hash,
    pinSalt: salt,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  return account;
}

export async function hasStoredKey(): Promise<boolean> {
  return (await getWrappedRecord()) !== null;
}

export async function revealApiKey(store: WrappingKeyStore): Promise<string> {
  const rec = await getWrappedRecord();
  if (!rec) throw new Error("No stored key");
  return unwrapApiKey(store, rec);
}

export async function signOut(): Promise<void> {
  localStorage.removeItem(ACCOUNT_KEY);
  await clearKeystore();
}
```

- [ ] **Step 5: Run to verify pass, then commit**

Run: `cd web && npx vitest run` (full web suite green) and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/units/indexeddb.ts web/src/units/indexeddb.test.ts web/src/units/auth.ts web/src/units/auth.test.ts
git commit -m "refactor(web): store the encrypted key blob in IndexedDB alongside its wrapping key"
```

---

### Task 2: The generation flow orchestrator (pure, tested)

**Files:**
- Create: `web/src/ui/flow.ts`, `web/src/ui/flow.test.ts`

**Interfaces:**
- Produces `type Screen = "signin" | "camera" | "generating" | "result" | "collection" | "settings"`.
- Produces `runGeneration(input, deps): Promise<{ base64: string; mimeType: string }>` - orchestrates the client side of the hybrid: check the usage guard; downscale; input face-gate (reject if supported and no face); call `generateBackOfHead`; run the OUTPUT face-gate heuristic and regenerate ONCE if a face is detected; record usage. All collaborators are injected so it is fully unit-testable. It returns the final image or throws a typed `FlowError { code }`.

- [ ] **Step 1: Write the failing test**

Create `web/src/ui/flow.test.ts`:

```ts
import { runGeneration, FlowError } from "./flow";

const baseDeps = () => ({
  now: 1000,
  history: [] as number[],
  downscale: async (_b: Blob) => ({ base64: "IN", mimeType: "image/jpeg", width: 100, height: 100 }),
  detectInput: async () => ({ supported: true, faceCount: 1 }),
  generate: async () => ({ base64: "OUT", mimeType: "image/jpeg" }),
  detectOutput: async () => ({ supported: true, faceCount: 0 }),
  toBlob: (_b64: string, _m: string) => new Blob(["x"]),
  saveUsage: (_h: number[]) => {},
});

const blob = new Blob(["input"], { type: "image/jpeg" });

test("happy path returns the generated image and records usage", async () => {
  let saved: number[] | undefined;
  const deps = { ...baseDeps(), saveUsage: (h: number[]) => (saved = h) };
  const out = await runGeneration({ blob, apiKey: "k" }, deps);
  expect(out).toEqual({ base64: "OUT", mimeType: "image/jpeg" });
  expect(saved).toEqual([1000]);
});

test("rejects when the usage guard blocks (too soon)", async () => {
  const deps = { ...baseDeps(), history: [1000] }; // last gen == now -> too_soon
  await expect(runGeneration({ blob, apiKey: "k" }, deps)).rejects.toMatchObject({ code: "too_soon" });
});

test("rejects when the input has no detectable face", async () => {
  const deps = { ...baseDeps(), detectInput: async () => ({ supported: true, faceCount: 0 }) };
  await expect(runGeneration({ blob, apiKey: "k" }, deps)).rejects.toMatchObject({ code: "no_face" });
});

test("regenerates once when the first output still shows a face, then succeeds", async () => {
  let calls = 0;
  const deps = {
    ...baseDeps(),
    generate: async () => {
      calls++;
      return { base64: `OUT${calls}`, mimeType: "image/jpeg" };
    },
    detectOutput: async () => ({ supported: true, faceCount: calls === 1 ? 1 : 0 }),
  };
  const out = await runGeneration({ blob, apiKey: "k" }, deps);
  expect(calls).toBe(2);
  expect(out.base64).toBe("OUT2");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/ui/flow.test.ts`
Expected: FAIL - cannot find module `./flow`.

- [ ] **Step 3: Implement flow.ts**

Create `web/src/ui/flow.ts`:

```ts
import { decide } from "../units/usageGuard";
import { hasDetectableFace, looksLikeBackOfHead, type FaceGateResult } from "../units/faceGate";

export type Screen = "signin" | "camera" | "generating" | "result" | "collection" | "settings";

export class FlowError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "FlowError";
    this.code = code;
  }
}

export interface GenerationDeps {
  now: number;
  history: number[];
  downscale: (b: Blob) => Promise<{ base64: string; mimeType: string; width: number; height: number }>;
  detectInput: (b: Blob) => Promise<FaceGateResult>;
  generate: (input: { image: { base64: string; mimeType: string }; apiKey: string }) => Promise<{
    base64: string;
    mimeType: string;
  }>;
  detectOutput: (b: Blob) => Promise<FaceGateResult>;
  toBlob: (base64: string, mimeType: string) => Blob;
  saveUsage: (history: number[]) => void;
}

export async function runGeneration(
  input: { blob: Blob; apiKey: string },
  deps: GenerationDeps,
): Promise<{ base64: string; mimeType: string }> {
  const gate = decide(deps.now, deps.history);
  if (!gate.allowed) throw new FlowError(gate.reason ?? "blocked", "Generation not allowed right now");

  if (!hasDetectableFace(await deps.detectInput(input.blob))) {
    throw new FlowError("no_face", "No face detected in the photo");
  }

  const small = await deps.downscale(input.blob);
  const image = { base64: small.base64, mimeType: small.mimeType };

  let result = await deps.generate({ image, apiKey: input.apiKey });
  // Client-side hybrid: if a face is detected in the result, regenerate ONCE.
  if (!looksLikeBackOfHead(await deps.detectOutput(deps.toBlob(result.base64, result.mimeType)))) {
    result = await deps.generate({ image, apiKey: input.apiKey });
  }

  deps.saveUsage([...deps.history.filter((t) => deps.now - t < 24 * 60 * 60 * 1000), deps.now]);
  return result;
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `cd web && npx vitest run src/ui/flow.test.ts` (expect 4 passing) and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/ui/flow.ts web/src/ui/flow.test.ts
git commit -m "feat(web): add the pure generation-flow orchestrator with the client hybrid loop"
```

---

### Task 3: Skin, icons, and shared components

**Files:**
- Create: `web/src/theme.css`, `web/src/ui/icons.tsx`, `web/src/ui/components/Wordmark.tsx`, `Button.tsx`, `TextField.tsx`, `PinInput.tsx`
- Test: `web/src/ui/components/PinInput.test.tsx`

**Interfaces:**
- `theme.css`: CSS custom properties (`--fb-blue: #1877F2`, surfaces, text, radius, spacing) and base styles for `.fb-btn`, `.fb-field`, `.fb-screen`, `.fb-topbar`, matching the approved mockups.
- `icons.tsx`: named SF-style line-icon components (`PhotoIcon`, `SwitchCameraIcon`, `GearIcon`, `EyeIcon`, `LockIcon`, `DownloadIcon`, `RetryIcon`, `TrashIcon`, `PersonIcon`, `KeyIcon`, `SignOutIcon`, `ChevronIcon`, `BackIcon`, `CheckIcon`), each an inline `<svg viewBox="0 0 24 24">` with `stroke="currentColor"` and `fill="none"`.
- `Wordmark.tsx`: the "FaceBack" text wordmark (no symbol).
- `Button`, `TextField`, `PinInput`: thin presentational components. `PinInput` exposes `value`/`onChange` and accepts only up to 4 digits.

- [ ] **Step 1: Write the failing PinInput test**

Create `web/src/ui/components/PinInput.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { PinInput } from "./PinInput";

function Harness() {
  const [pin, setPin] = useState("");
  return (
    <>
      <PinInput value={pin} onChange={setPin} label="PIN" />
      <span data-testid="val">{pin}</span>
    </>
  );
}

test("PinInput accepts up to 4 digits and rejects non-digits", () => {
  render(<Harness />);
  const input = screen.getByLabelText("PIN");
  fireEvent.change(input, { target: { value: "12ab34567" } });
  expect(screen.getByTestId("val").textContent).toBe("1234");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/ui/components/PinInput.test.tsx`
Expected: FAIL - cannot find module `./PinInput`.

- [ ] **Step 3: Implement the components, icons, and theme**

Create `web/src/theme.css`:

```css
:root {
  --fb-blue: #1877f2;
  --fb-blue-dark: #0b5fce;
  --fb-bg: #f0f2f5;
  --fb-card: #ffffff;
  --fb-text: #14171a;
  --fb-muted: #65676b;
  --fb-line: #dcdfe4;
  --fb-radius: 12px;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--fb-bg); color: var(--fb-text); }
.fb-screen { max-width: 480px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; background: var(--fb-bg); }
.fb-topbar { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: var(--fb-card); border-bottom: 1px solid var(--fb-line); }
.fb-wordmark { font-weight: 800; letter-spacing: -0.03em; color: var(--fb-blue); }
.fb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 12px; border: none; border-radius: var(--fb-radius); background: var(--fb-blue); color: #fff; font-weight: 650; font-size: 15px; cursor: pointer; }
.fb-btn:disabled { opacity: 0.5; cursor: default; }
.fb-btn.sec { background: var(--fb-card); color: var(--fb-text); border: 1px solid var(--fb-line); }
.fb-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.fb-field label { font-size: 12px; font-weight: 600; color: var(--fb-muted); }
.fb-field input { padding: 11px 12px; border: 1px solid var(--fb-line); border-radius: var(--fb-radius); font-size: 15px; background: var(--fb-card); }
.fb-icon { width: 1.4em; height: 1.4em; stroke: currentColor; fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; vertical-align: middle; }
```

Create `web/src/ui/icons.tsx` (each icon is a small component; example set - implement all listed in Interfaces with `className="fb-icon"`):

```tsx
type P = { className?: string };
const S = (props: { children: React.ReactNode } & P) => (
  <svg viewBox="0 0 24 24" className={props.className ?? "fb-icon"} aria-hidden="true">
    {props.children}
  </svg>
);
export const PhotoIcon = (p: P) => (
  <S {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="M21 16l-4.5-4.5L11 17l-2.5-2.5L3 19" />
  </S>
);
export const SwitchCameraIcon = (p: P) => (
  <S {...p}>
    <path d="M20 11a8 8 0 00-14-4.5L4 8" />
    <path d="M4 13a8 8 0 0014 4.5L20 16" />
    <path d="M4 4v4h4" />
    <path d="M20 20v-4h-4" />
  </S>
);
export const GearIcon = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3v2.6M12 18.4V21M21 12h-2.6M5.6 12H3M18.36 5.64l-1.84 1.84M7.48 16.52l-1.84 1.84M18.36 18.36l-1.84-1.84M7.48 7.48L5.64 5.64" />
  </S>
);
export const EyeIcon = (p: P) => (<S {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" /></S>);
export const LockIcon = (p: P) => (<S {...p}><rect x="5" y="11" width="14" height="9" rx="2.2" /><path d="M8 11V8a4 4 0 018 0v3" /></S>);
export const DownloadIcon = (p: P) => (<S {...p}><path d="M12 4v10" /><path d="M8 10.5l4 4 4-4" /><path d="M5 20h14" /></S>);
export const RetryIcon = (p: P) => (<S {...p}><path d="M3.5 12a8.5 8.5 0 108.5-8.5A8.5 8.5 0 005.5 6.5L3.5 8.5" /><path d="M3.5 3.5v5h5" /></S>);
export const TrashIcon = (p: P) => (<S {...p}><path d="M4 7h16" /><path d="M9 7V5.4A1.4 1.4 0 0110.4 4h3.2A1.4 1.4 0 0115 5.4V7" /><path d="M6.2 7l1 12.2a1.5 1.5 0 001.5 1.4h6.6a1.5 1.5 0 001.5-1.4L18 7" /><path d="M10 11v6M14 11v6" /></S>);
export const PersonIcon = (p: P) => (<S {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5.6 20a6.5 6.5 0 0112.8 0" /></S>);
export const KeyIcon = (p: P) => (<S {...p}><circle cx="8" cy="15" r="3.4" /><path d="M10.4 12.6L20 3M17 6l2.2 2.2M14.4 8.6l2.2 2.2" /></S>);
export const SignOutIcon = (p: P) => (<S {...p}><path d="M14 4.5h3.5A1.5 1.5 0 0119 6v12a1.5 1.5 0 01-1.5 1.5H14" /><path d="M10 12h9.5" /><path d="M15.5 8l4 4-4 4" /></S>);
export const ChevronIcon = (p: P) => (<S {...p}><path d="M9 6l6 6-6 6" /></S>);
export const BackIcon = (p: P) => (<S {...p}><path d="M15 6l-6 6 6 6" /></S>);
export const CheckIcon = (p: P) => (<S {...p}><path d="M5 13l4 4 10-11" /></S>);
```

Create `web/src/ui/components/Wordmark.tsx`:

```tsx
export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="fb-wordmark" style={{ fontSize: size }}>
      FaceBack
    </span>
  );
}
```

Create `web/src/ui/components/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  variant = "primary",
  ...rest
}: { children: ReactNode; variant?: "primary" | "secondary" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={variant === "secondary" ? "fb-btn sec" : "fb-btn"} {...rest}>
      {children}
    </button>
  );
}
```

Create `web/src/ui/components/TextField.tsx`:

```tsx
import type { InputHTMLAttributes, ReactNode } from "react";

export function TextField({
  label,
  trailing,
  ...rest
}: { label: string; trailing?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="fb-field">
      <label htmlFor={rest.id ?? label}>{label}</label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input id={rest.id ?? label} aria-label={label} style={{ flex: 1 }} {...rest} />
        {trailing ? <span style={{ position: "absolute", right: 10 }}>{trailing}</span> : null}
      </div>
    </div>
  );
}
```

Create `web/src/ui/components/PinInput.tsx`:

```tsx
export function PinInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="fb-field">
      <label htmlFor={label}>{label}</label>
      <input
        id={label}
        aria-label={label}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="4-digit PIN"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `cd web && npx vitest run src/ui/components/PinInput.test.tsx` (expect passing) and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/theme.css web/src/ui/icons.tsx web/src/ui/components/
git commit -m "feat(web): add FaceBack skin, SF-style icons, and shared components"
```

---

### Task 4: SignIn screen (create account)

**Files:**
- Create: `web/src/ui/screens/SignIn.tsx`
- Test: `web/src/ui/screens/SignIn.test.tsx`

**Interfaces:**
- `SignIn({ onCreated }: { onCreated: () => void })` - form with Username, Email, Nano Banana 2 key (masked + reveal), PIN, Confirm PIN. Create is disabled until all fields are valid (email contains `@`, PIN is 4 digits and matches confirm, key non-empty). On submit it calls `auth.createAccount(...)` with `createIndexedDbWrappingKeyStore()` and then `onCreated()`.

- [ ] **Step 1: Write the failing test**

Create `web/src/ui/screens/SignIn.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { SignIn } from "./SignIn";
import * as auth from "../../units/auth";

beforeEach(() => localStorage.clear());

test("Create is disabled until the form is valid, then calls createAccount and onCreated", async () => {
  const spy = vi.spyOn(auth, "createAccount").mockResolvedValue({} as any);
  const onCreated = vi.fn();
  render(<SignIn onCreated={onCreated} />);

  const create = screen.getByRole("button", { name: /create account/i });
  expect(create).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "charlie" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "c@e.com" } });
  fireEvent.change(screen.getByLabelText("Nano Banana 2 key"), { target: { value: "sk-123" } });
  fireEvent.change(screen.getByLabelText("Set a 4-digit PIN"), { target: { value: "1234" } });
  fireEvent.change(screen.getByLabelText("Confirm PIN"), { target: { value: "1234" } });

  expect(create).toBeEnabled();
  fireEvent.click(create);
  await waitFor(() => expect(onCreated).toHaveBeenCalled());
  expect(spy).toHaveBeenCalledWith(
    { username: "charlie", email: "c@e.com", apiKey: "sk-123", pin: "1234" },
    expect.anything(),
  );
  spy.mockRestore();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/ui/screens/SignIn.test.tsx`
Expected: FAIL - cannot find module `./SignIn`.

- [ ] **Step 3: Implement SignIn**

Create `web/src/ui/screens/SignIn.tsx`:

```tsx
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
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `cd web && npx vitest run src/ui/screens/SignIn.test.tsx` (expect passing) and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/ui/screens/SignIn.tsx web/src/ui/screens/SignIn.test.tsx
git commit -m "feat(web): add the SignIn / create-account screen"
```

---

### Task 5: Collection screen (grid + multi-select delete)

**Files:**
- Create: `web/src/ui/screens/Collection.tsx`
- Test: `web/src/ui/screens/Collection.test.tsx`

**Interfaces:**
- `Collection({ onBack }: { onBack: () => void })` - loads items via `collection.listItems()`, renders a grid of object-URL thumbnails, a Select mode toggling per-item checkmarks, and a "Delete (n)" bar that calls `collection.deleteItems(ids)` then reloads. Empty state: "No backs yet."

- [ ] **Step 1: Write the failing test**

Create `web/src/ui/screens/Collection.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Collection } from "./Collection";
import * as store from "../../units/collection";
import type { CollectionItem } from "../../types";

const items: CollectionItem[] = [
  { id: "a", imageBlob: new Blob(["a"]), mimeType: "image/jpeg", width: 10, height: 10, createdAt: "2026-01-02T00:00:00Z" },
  { id: "b", imageBlob: new Blob(["b"]), mimeType: "image/jpeg", width: 10, height: 10, createdAt: "2026-01-01T00:00:00Z" },
];

beforeEach(() => {
  (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:x");
  (globalThis.URL as any).revokeObjectURL = vi.fn();
});

test("selecting items and deleting calls deleteItems with the chosen ids", async () => {
  vi.spyOn(store, "listItems").mockResolvedValue(items);
  const del = vi.spyOn(store, "deleteItems").mockResolvedValue();
  render(<Collection onBack={() => {}} />);

  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  fireEvent.click(screen.getByRole("button", { name: /select/i }));
  fireEvent.click(screen.getByTestId("tile-a"));
  fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  await waitFor(() => expect(del).toHaveBeenCalledWith(["a"]));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/ui/screens/Collection.test.tsx`
Expected: FAIL - cannot find module `./Collection`.

- [ ] **Step 3: Implement Collection**

Create `web/src/ui/screens/Collection.tsx`:

```tsx
import { useEffect, useState } from "react";
import { listItems, deleteItems } from "../../units/collection";
import type { CollectionItem } from "../../types";
import { BackIcon, TrashIcon, CheckIcon } from "../icons";

export function Collection({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function reload() {
    setItems(await listItems());
  }
  useEffect(() => {
    void reload();
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function remove() {
    await deleteItems([...selected]);
    setSelected(new Set());
    setSelecting(false);
    await reload();
  }

  return (
    <div className="fb-screen">
      <div className="fb-topbar">
        <span role="button" aria-label="Back" onClick={onBack} style={{ cursor: "pointer", color: "var(--fb-blue)", display: "flex" }}>
          <BackIcon />
        </span>
        <strong>Your Backs</strong>
        <button className="fb-btn sec" style={{ width: "auto", padding: "6px 10px" }} onClick={() => { setSelecting((s) => !s); setSelected(new Set()); }}>
          {selecting ? "Cancel" : "Select"}
        </button>
      </div>
      <div style={{ flex: 1, padding: 12 }}>
        {items.length === 0 ? (
          <div style={{ color: "var(--fb-muted)", textAlign: "center", marginTop: 40 }}>No backs yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {items.map((it) => (
              <div
                key={it.id}
                data-testid={`tile-${it.id}`}
                onClick={() => selecting && toggle(it.id)}
                style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", outline: selected.has(it.id) ? "3px solid var(--fb-blue)" : "none", cursor: selecting ? "pointer" : "default" }}
              >
                <img src={URL.createObjectURL(it.imageBlob)} alt="back of head" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {selecting && selected.has(it.id) ? (
                  <span style={{ position: "absolute", top: 4, right: 4, background: "var(--fb-blue)", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckIcon />
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
      {selecting ? (
        <div style={{ padding: 12, borderTop: "1px solid var(--fb-line)", background: "var(--fb-card)" }}>
          <button className="fb-btn" style={{ background: "#c0271b" }} disabled={selected.size === 0} onClick={remove}>
            <TrashIcon /> Delete ({selected.size})
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `cd web && npx vitest run src/ui/screens/Collection.test.tsx` (expect passing) and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/ui/screens/Collection.tsx web/src/ui/screens/Collection.test.tsx
git commit -m "feat(web): add the Collection screen with multi-select delete"
```

---

### Task 6: Settings screen (PIN-gated key edit, sign out, recovery entry)

**Files:**
- Create: `web/src/ui/screens/Settings.tsx`
- Test: `web/src/ui/screens/Settings.test.tsx`

**Interfaces:**
- `Settings({ onBack, onSignedOut }: { onBack: () => void; onSignedOut: () => void })` - lists the account username, "Edit API key" (opens a PIN prompt; on a correct PIN via `auth.verifyAccountPin`, reveals the key via `auth.revealApiKey(createIndexedDbWrappingKeyStore())`), and "Sign out" (calls `auth.signOut()` then `onSignedOut`). A wrong PIN shows an error and does not reveal.

- [ ] **Step 1: Write the failing test**

Create `web/src/ui/screens/Settings.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Settings } from "./Settings";
import * as auth from "../../units/auth";

beforeEach(() => localStorage.clear());

test("Edit API key reveals the key only after a correct PIN", async () => {
  vi.spyOn(auth, "getAccount").mockReturnValue({ username: "charlie" } as any);
  vi.spyOn(auth, "verifyAccountPin").mockImplementation(async (p) => p === "1234");
  vi.spyOn(auth, "revealApiKey").mockResolvedValue("sk-secret");

  render(<Settings onBack={() => {}} onSignedOut={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /edit api key/i }));

  fireEvent.change(screen.getByLabelText(/enter pin/i), { target: { value: "0000" } });
  fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
  await waitFor(() => expect(screen.getByText(/incorrect pin/i)).toBeInTheDocument());
  expect(screen.queryByDisplayValue("sk-secret")).toBeNull();

  fireEvent.change(screen.getByLabelText(/enter pin/i), { target: { value: "1234" } });
  fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
  await waitFor(() => expect(screen.getByDisplayValue("sk-secret")).toBeInTheDocument());
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/ui/screens/Settings.test.tsx`
Expected: FAIL - cannot find module `./Settings`.

- [ ] **Step 3: Implement Settings**

Create `web/src/ui/screens/Settings.tsx`:

```tsx
import { useState } from "react";
import { getAccount, verifyAccountPin, revealApiKey, signOut } from "../../units/auth";
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

  async function unlock() {
    setError("");
    if (!(await verifyAccountPin(pin))) {
      setError("Incorrect PIN");
      return;
    }
    setRevealed(await revealApiKey(createIndexedDbWrappingKeyStore()));
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
            <input aria-label="API key" defaultValue={revealed} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--fb-line)" }} />
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
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `cd web && npx vitest run src/ui/screens/Settings.test.tsx` (expect passing) and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/ui/screens/Settings.tsx web/src/ui/screens/Settings.test.tsx
git commit -m "feat(web): add the Settings screen with PIN-gated key reveal and sign out"
```

---

### Task 7: Camera, Generating, and Result screens + App shell

**Files:**
- Create: `web/src/ui/screens/Camera.tsx`, `web/src/ui/screens/Generating.tsx`, `web/src/ui/screens/Result.tsx`
- Rewrite: `web/src/App.tsx`
- Test: extend/replace `web/src/smoke.test.tsx`

**Interfaces:**
- `Camera({ onCaptured }: { onCaptured: (blob: Blob) => void; onOpenSettings: () => void })` - starts the back camera (`camera.startStream("environment")`), shows the live video, a shutter (captureFrame), a switch-facing control, an upload control (file input), and a settings gear.
- `Generating()` - the spinner state.
- `Result({ image, onSave, onRetry, onDiscard })` - header `It's just the back of their head.`, the generated image, Save / Retry / Discard.
- `App` - holds `screen` + `signedIn` state. First run (no account) shows `SignIn`. Signed in shows Camera with a bottom nav to Collection / Settings, and drives the flow: Camera capture -> Generating -> `runGeneration` (wired with the real units + `revealApiKey` for the key) -> auto-add to collection -> Result. Save calls `export.saveImageToDevice`.

- [ ] **Step 1: Write the failing shell test**

Replace `web/src/smoke.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import App from "./App";

beforeEach(() => localStorage.clear());

test("first run shows the SignIn create-account screen", async () => {
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument());
});

test("test environment exposes crypto.subtle and indexedDB", () => {
  expect(globalThis.crypto.subtle).toBeDefined();
  expect(globalThis.indexedDB).toBeDefined();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/smoke.test.tsx`
Expected: FAIL - App renders the old placeholder, no "Create account" button.

- [ ] **Step 3: Implement the three screens and rewrite App**

Create `web/src/ui/screens/Generating.tsx`:

```tsx
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
```

Create `web/src/ui/screens/Result.tsx`:

```tsx
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
```

Create `web/src/ui/screens/Camera.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { startStream, stopStream, captureFrame, otherFacing, type Facing } from "../../units/camera";
import { Wordmark } from "../components/Wordmark";
import { GearIcon, PhotoIcon, SwitchCameraIcon } from "../icons";

export function Camera({ onCaptured, onOpenSettings }: { onCaptured: (blob: Blob) => void; onOpenSettings: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [err, setErr] = useState("");

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    startStream(facing)
      .then((s) => {
        stream = s;
        if (!cancelled && videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
      })
      .catch(() => setErr("Camera unavailable. You can upload a photo instead."));
    return () => {
      cancelled = true;
      if (stream) stopStream(stream);
    };
  }, [facing]);

  async function shoot() {
    if (!videoRef.current || !videoRef.current.videoWidth) return;
    onCaptured(await captureFrame(videoRef.current));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onCaptured(f);
  }

  return (
    <div className="fb-screen">
      <div className="fb-topbar">
        <Wordmark size={17} />
        <span role="button" aria-label="Settings" onClick={onOpenSettings} style={{ cursor: "pointer", color: "var(--fb-muted)", display: "flex" }}>
          <GearIcon />
        </span>
      </div>
      <div style={{ flex: 1, position: "relative", background: "#14161a" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 10, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 12 }}>
          {err || "Back camera - tap switch for front"}
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label aria-label="Upload photo" style={{ color: "#fff", cursor: "pointer", display: "flex" }}>
            <PhotoIcon />
            <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
          </label>
          <button aria-label="Shutter" onClick={shoot} style={{ width: 64, height: 64, borderRadius: "50%", background: "#fff", border: "4px solid rgba(255,255,255,.5)" }} />
          <button aria-label="Switch camera" onClick={() => setFacing((f) => otherFacing(f))} style={{ color: "#fff", background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <SwitchCameraIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
```

Rewrite `web/src/App.tsx` to wire the flow (holds screen + signed-in state; drives Camera -> Generating -> runGeneration -> collection.addItem -> Result; bottom nav to Collection / Settings). Wire `runGeneration`'s deps to the real units: `downscale: downscaleImage`, `detectInput/detectOutput` via `detectFaces(await createImageBitmap(blob))`, `generate: (a) => generateBackOfHead(a)`, `toBlob: base64ToBlob`, `saveUsage: (h) => saveHistory(h)`, `now: Date.now()`, `history: loadHistory()`, and read the key via `revealApiKey(createIndexedDbWrappingKeyStore())`. Import `./theme.css`. Keep App under ~150 lines; it is glue only.

(Full `App.tsx` is written by the implementer following the interfaces above and the approved mockups; it must render `SignIn` when `getAccount()` is null, else the Camera with bottom nav, and route capture through `Generating` to `Result`.)

- [ ] **Step 4: Run to verify pass, then commit**

Run: `cd web && npx vitest run` (full web suite green, including the new shell smoke test) and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/ui/screens/ web/src/App.tsx web/src/smoke.test.tsx web/src/main.tsx
git commit -m "feat(web): add Camera/Generating/Result screens and wire the app shell"
```

- [ ] **Step 5: Dev-server visual pass (controller task, not a subagent)**

Start `cd web && npm run dev` and open the app; screenshot the SignIn, Collection (empty), and Settings screens (the non-camera screens render without a device). Confirm the FaceBack skin matches the approved mockups (blue, wordmark, icons, spacing). Note any visual gaps for a polish pass. The camera + real generation are validated by the user with a Gemini key.

---

## Self-Review

**1. Spec coverage.** Storage-of-record fix (Task 1); the client hybrid flow with the output face-check + regenerate-once + usage guard (Task 2); the skin/icons/wordmark-only branding (Task 3); all six screens - SignIn (4), Collection with multi-delete (5), Settings with PIN-gated key reveal (6), Camera/Generating/Result with the exact result copy (7); auto-add to collection + separate Save export (Task 7 wiring). Covered.

**2. Placeholder scan.** The only prose-level deferral is `App.tsx`'s full body (its interfaces, deps wiring, and constraints are fully specified; it is glue over already-tested units). Every other step has complete code. No TBD/TODO.

**3. Type consistency.** `Screen` (Task 2) used by App (Task 7). `runGeneration`'s `GenerationDeps` match its wiring in Task 7. `createIndexedDbWrappingKeyStore` (Plan 1) used by SignIn/Settings. `auth.signOut` is now async (Task 1) and awaited in Settings (Task 6). `collection.listItems/deleteItems`, `faceGate.detectFaces/hasDetectableFace/looksLikeBackOfHead`, `imageUtil.downscaleImage/base64ToBlob`, `usageGuard.decide/loadHistory/saveHistory`, `generationClient.generateBackOfHead`, `export.saveImageToDevice` all consumed with their Plan 1-3 signatures. Consistent.
