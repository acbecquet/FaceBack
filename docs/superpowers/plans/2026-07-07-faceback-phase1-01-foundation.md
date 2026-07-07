# FaceBack Phase 1 - Plan 1: Foundation (scaffold + keystore + auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the FaceBack web project and its on-device identity layer: a user can create a local account whose Gemini key is encrypted at rest and whose 4-digit PIN can be verified, all covered by unit tests.

**Architecture:** A React + Vite + TypeScript app organized into small single-responsibility units under `web/src/units`. This first plan builds the non-visual foundation: domain types, a `keystore` unit (PBKDF2 PIN hashing and WebCrypto AES-GCM key encryption behind an injectable persistence interface), and an `auth` unit (account create/get/sign-out in localStorage). Persistence is injected so the crypto logic is unit-testable in Node while the IndexedDB implementation is exercised in the browser later.

**Tech Stack:** React 18, Vite, TypeScript, Vitest, @testing-library/react, jsdom, fake-indexeddb, WebCrypto (`globalThis.crypto.subtle`).

## Global Constraints

These apply to every task in every FaceBack plan. Values are copied verbatim from `docs/superpowers/specs/2026-07-07-faceback-design.md`.

- Stack: React 18 + Vite + TypeScript. No heavy state library.
- Local-first: account, key, and collection live on the device. The two serverless functions are stateless and store nothing.
- Account fields: `username`, `email`, a 4-digit `PIN`, and the user's Nano Banana 2 key. No password.
- PIN scope: never requested in normal use; only at account creation and to reveal/edit the key in Settings.
- Key at rest (web): encrypted with a non-extractable WebCrypto AES-GCM key; the wrapping key is persisted in IndexedDB. The PIN is a separate PBKDF2 hash and does not encrypt the key.
- Model id (later plans): `gemini-3.1-flash-image` (Nano Banana 2), called only inside the server-side generation function.
- Branding: the "FaceBack" text wordmark only, no logo symbol.
- Copy must use plain hyphens, never the em dash character.
- Result screen header copy (later plan): `It's just the back of their head.`
- Camera default (later plan): back camera, with a switch to front.

## Plan series (Phase 1)

This is plan 1 of 4 for the Phase 1 web reference. Each produces working, tested software and is validated through the no-mistakes pipeline before the next is written.

1. Foundation - scaffold + keystore + auth. (this plan)
2. Functions backend - signed tokens, the Gemini Interactions API client, the generation function, the recovery function, and their web client callers.
3. Capture + generation - faceGate, camera, generationClient wired to the generation function, plus the Camera / Generating / Result screens.
4. Collection + shell - collection (IndexedDB) with multi-select delete, export to Photos, the SignIn / Collection / Settings screens, the FaceBack skin and icons, and app navigation.

## Full Phase 1 file structure (decomposition, locked here)

```
web/
  package.json  tsconfig.json  vite.config.ts  vitest.config.ts  index.html
  src/
    main.tsx                      # React entry (Plan 4 fills the real shell)
    App.tsx                       # app shell + navigation (Plan 4)
    theme.css                     # FaceBack skin tokens (Plan 4)
    setupTests.ts                 # test env: crypto + fake-indexeddb
    types.ts                      # Account, WrappedKeyRecord, CollectionItem
    units/
      config.ts                   # constants (caps, iterations, endpoints)
      keystore.ts                 # PIN hash/verify + key encryption (Plan 1)
      auth.ts                     # account create/get/sign-out (Plan 1)
      indexeddb.ts                # IndexedDB WrappingKeyStore impl (Plan 1)
      recovery.ts                 # recovery client (Plan 2)
      faceGate.ts                 # face detection input gate (Plan 3)
      generationClient.ts         # downscale + POST to generate fn (Plan 3)
      camera.ts                   # getUserMedia wrapper (Plan 3)
      collection.ts               # IndexedDB image store + delete (Plan 4)
      export.ts                   # save to Photos / download (Plan 4)
    ui/                           # six screens + icons (Plans 3-4)
functions/
  src/
    lib/tokens.ts                 # HMAC signed tokens (Plan 2)
    lib/prompt.ts                 # fixed hardened prompt (Plan 2)
    lib/gemini.ts                 # Interactions API client (Plan 2)
    lib/email.ts                  # EmailProvider interface (Plan 2)
    generate.ts                   # generation function handler (Plan 2)
    recovery.ts                   # recovery function handler (Plan 2)
```

This plan (Plan 1) creates: `package.json`, the four config files, `index.html`, `src/main.tsx`, `src/setupTests.ts`, `src/types.ts`, `src/units/config.ts`, `src/units/keystore.ts`, `src/units/indexeddb.ts`, `src/units/auth.ts`, and their tests.

---

### Task 1: Scaffold the web app with a passing smoke test

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/vitest.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/setupTests.ts`
- Test: `web/src/smoke.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: a Vite + React + TS project with `npm test` running Vitest in a jsdom environment that has a working `crypto.subtle` and a global `indexedDB`. Later tasks rely on `web/src/setupTests.ts` providing both.

- [ ] **Step 1: Create the project directory and package.json**

Run from repo root:

```bash
mkdir -p web/src
cd web
```

Create `web/package.json`:

```json
{
  "name": "faceback-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.2",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Add the config files**

Create `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

Create `web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: true },
});
```

Create `web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
  },
});
```

- [ ] **Step 3: Add the test setup that guarantees crypto and indexedDB**

Create `web/src/setupTests.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";

// jsdom does not provide crypto.subtle; use Node's WebCrypto implementation.
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}
```

- [ ] **Step 4: Add the entry, a minimal App, and index.html**

Create `web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>FaceBack</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `web/src/App.tsx`:

```tsx
export default function App() {
  return <div>FaceBack</div>;
}
```

Create `web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Write the smoke test**

Create `web/src/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the FaceBack wordmark", () => {
  render(<App />);
  expect(screen.getByText("FaceBack")).toBeInTheDocument();
});

test("test environment exposes crypto.subtle and indexedDB", () => {
  expect(globalThis.crypto.subtle).toBeDefined();
  expect(globalThis.indexedDB).toBeDefined();
});
```

- [ ] **Step 6: Install and run the tests**

Run:

```bash
cd web && npm install && npm test
```

Expected: both tests PASS.

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "chore(web): scaffold Vite + React + TS with Vitest, crypto and indexedDB test env"
```

---

### Task 2: Domain types and config constants

**Files:**
- Create: `web/src/types.ts`, `web/src/units/config.ts`
- Test: `web/src/units/config.test.ts`

**Interfaces:**
- Produces:
  - `Account { username: string; email: string; pinHash: string; pinSalt: string; createdAt: string }`
  - `WrappedKeyRecord { ciphertext: string; iv: string }`
  - `CollectionItem { id: string; imageBlob: Blob; mimeType: string; width: number; height: number; createdAt: string }`
  - `config` object with `PBKDF2_ITERATIONS: number`, `MAX_IMAGE_EDGE: number`, `MIN_GENERATION_INTERVAL_MS: number`, `DAILY_CAP: number`, `FUNCTIONS_BASE_URL: string`.

- [ ] **Step 1: Write the failing config test**

Create `web/src/units/config.test.ts`:

```ts
import { config } from "./config";

test("config has safe crypto and cost defaults", () => {
  expect(config.PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100_000);
  expect(config.MAX_IMAGE_EDGE).toBeGreaterThan(0);
  expect(config.MIN_GENERATION_INTERVAL_MS).toBeGreaterThan(0);
  expect(config.DAILY_CAP).toBeGreaterThan(0);
  expect(typeof config.FUNCTIONS_BASE_URL).toBe("string");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/units/config.test.ts`
Expected: FAIL - cannot find module `./config`.

- [ ] **Step 3: Create the types**

Create `web/src/types.ts`:

```ts
export interface Account {
  username: string;
  email: string;
  pinHash: string; // base64 PBKDF2(pin, salt)
  pinSalt: string; // base64
  createdAt: string; // ISO 8601
}

export interface WrappedKeyRecord {
  ciphertext: string; // base64 AES-GCM ciphertext of the API key
  iv: string; // base64 12-byte IV
}

export interface CollectionItem {
  id: string;
  imageBlob: Blob;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string; // ISO 8601
}
```

- [ ] **Step 4: Create the config**

Create `web/src/units/config.ts`:

```ts
export const config = {
  PBKDF2_ITERATIONS: 210_000,
  MAX_IMAGE_EDGE: 1024, // downscale longest edge before upload
  MIN_GENERATION_INTERVAL_MS: 3_000,
  DAILY_CAP: 50,
  // Base URL for the two stateless functions; overridden per environment in Plan 2.
  FUNCTIONS_BASE_URL: import.meta.env?.VITE_FUNCTIONS_BASE_URL ?? "/api",
} as const;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd web && npx vitest run src/units/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/units/config.ts web/src/units/config.test.ts
git commit -m "feat(web): add domain types and config constants"
```

---

### Task 3: keystore - PIN hashing and verification

**Files:**
- Create: `web/src/units/keystore.ts`
- Test: `web/src/units/keystore.pin.test.ts`

**Interfaces:**
- Consumes: `config.PBKDF2_ITERATIONS`.
- Produces:
  - `hashPin(pin: string, saltB64?: string): Promise<{ hash: string; salt: string }>`
  - `verifyPin(pin: string, hashB64: string, saltB64: string): Promise<boolean>`
  - base64 helpers `bytesToB64(b: Uint8Array): string` and `b64ToBytes(s: string): Uint8Array` (exported for reuse by later keystore functions).

- [ ] **Step 1: Write the failing test**

Create `web/src/units/keystore.pin.test.ts`:

```ts
import { hashPin, verifyPin } from "./keystore";

test("hashPin produces a salt and a hash, and verifyPin round-trips", async () => {
  const { hash, salt } = await hashPin("1234");
  expect(hash.length).toBeGreaterThan(0);
  expect(salt.length).toBeGreaterThan(0);
  await expect(verifyPin("1234", hash, salt)).resolves.toBe(true);
});

test("verifyPin rejects the wrong PIN", async () => {
  const { hash, salt } = await hashPin("1234");
  await expect(verifyPin("0000", hash, salt)).resolves.toBe(false);
});

test("two hashes of the same PIN use different salts", async () => {
  const a = await hashPin("1234");
  const b = await hashPin("1234");
  expect(a.salt).not.toBe(b.salt);
  expect(a.hash).not.toBe(b.hash);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/units/keystore.pin.test.ts`
Expected: FAIL - cannot find module `./keystore`.

- [ ] **Step 3: Implement the PIN functions**

Create `web/src/units/keystore.ts`:

```ts
import { config } from "./config";

const enc = new TextEncoder();

export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPin(
  pin: string,
  saltB64?: string,
): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: config.PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    256,
  );
  return { hash: bytesToB64(new Uint8Array(bits)), salt: bytesToB64(salt) };
}

export async function verifyPin(
  pin: string,
  hashB64: string,
  saltB64: string,
): Promise<boolean> {
  const { hash } = await hashPin(pin, saltB64);
  return timingSafeEqual(hash, hashB64);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run src/units/keystore.pin.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/units/keystore.ts web/src/units/keystore.pin.test.ts
git commit -m "feat(web): add PBKDF2 PIN hashing and verification to keystore"
```

---

### Task 4: keystore - encrypt the API key at rest

**Files:**
- Modify: `web/src/units/keystore.ts`
- Test: `web/src/units/keystore.key.test.ts`

**Interfaces:**
- Consumes: `WrappedKeyRecord` from `types.ts`; `bytesToB64`/`b64ToBytes` from Task 3.
- Produces:
  - `interface WrappingKeyStore { get(): Promise<CryptoKey | null>; set(key: CryptoKey): Promise<void> }`
  - `wrapApiKey(store: WrappingKeyStore, apiKey: string): Promise<WrappedKeyRecord>`
  - `unwrapApiKey(store: WrappingKeyStore, rec: WrappedKeyRecord): Promise<string>`
  - `createMemoryWrappingKeyStore(): WrappingKeyStore` (for tests and non-persistent contexts)

- [ ] **Step 1: Write the failing test**

Create `web/src/units/keystore.key.test.ts`:

```ts
import {
  wrapApiKey,
  unwrapApiKey,
  createMemoryWrappingKeyStore,
} from "./keystore";

test("wrap then unwrap returns the original API key", async () => {
  const store = createMemoryWrappingKeyStore();
  const secret = "AIzaSy-fake-gemini-key-123";
  const rec = await wrapApiKey(store, secret);
  expect(rec.ciphertext).not.toContain(secret);
  await expect(unwrapApiKey(store, rec)).resolves.toBe(secret);
});

test("a wrong wrapping key cannot decrypt the record", async () => {
  const rec = await wrapApiKey(createMemoryWrappingKeyStore(), "secret-A");
  const otherStore = createMemoryWrappingKeyStore();
  await expect(unwrapApiKey(otherStore, rec)).rejects.toBeDefined();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/units/keystore.key.test.ts`
Expected: FAIL - `wrapApiKey` is not exported.

- [ ] **Step 3: Add key encryption to keystore.ts**

Append to `web/src/units/keystore.ts`:

```ts
import type { WrappedKeyRecord } from "../types";

export interface WrappingKeyStore {
  get(): Promise<CryptoKey | null>;
  set(key: CryptoKey): Promise<void>;
}

export function createMemoryWrappingKeyStore(): WrappingKeyStore {
  let held: CryptoKey | null = null;
  return {
    async get() {
      return held;
    },
    async set(key) {
      held = key;
    },
  };
}

async function getOrCreateWrappingKey(store: WrappingKeyStore): Promise<CryptoKey> {
  const existing = await store.get();
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: raw bytes can never be read back out
    ["encrypt", "decrypt"],
  );
  await store.set(key);
  return key;
}

export async function wrapApiKey(
  store: WrappingKeyStore,
  apiKey: string,
): Promise<WrappedKeyRecord> {
  const key = await getOrCreateWrappingKey(store);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(apiKey));
  return { ciphertext: bytesToB64(new Uint8Array(ct)), iv: bytesToB64(iv) };
}

export async function unwrapApiKey(
  store: WrappingKeyStore,
  rec: WrappedKeyRecord,
): Promise<string> {
  const key = await getOrCreateWrappingKey(store);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(rec.iv) },
    key,
    b64ToBytes(rec.ciphertext),
  );
  return new TextDecoder().decode(pt);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run src/units/keystore.key.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/units/keystore.ts web/src/units/keystore.key.test.ts
git commit -m "feat(web): encrypt the API key at rest with a non-extractable WebCrypto key"
```

---

### Task 5: keystore - the IndexedDB wrapping-key store (browser persistence)

**Files:**
- Create: `web/src/units/indexeddb.ts`
- Test: `web/src/units/indexeddb.test.ts`

**Interfaces:**
- Consumes: `WrappingKeyStore` from Task 4.
- Produces: `createIndexedDbWrappingKeyStore(): WrappingKeyStore` that persists the `CryptoKey` object in an IndexedDB object store named `keys` under key `wrappingKey`.

- [ ] **Step 1: Write the failing test**

Create `web/src/units/indexeddb.test.ts`:

```ts
import { createIndexedDbWrappingKeyStore } from "./indexeddb";
import { wrapApiKey, unwrapApiKey } from "./keystore";

test("the IndexedDB store persists the wrapping key across store instances", async () => {
  const storeA = createIndexedDbWrappingKeyStore();
  const rec = await wrapApiKey(storeA, "persisted-secret");

  // A fresh store instance reads the same persisted CryptoKey from IndexedDB.
  const storeB = createIndexedDbWrappingKeyStore();
  await expect(unwrapApiKey(storeB, rec)).resolves.toBe("persisted-secret");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/units/indexeddb.test.ts`
Expected: FAIL - cannot find module `./indexeddb`.

- [ ] **Step 3: Implement the IndexedDB store**

Create `web/src/units/indexeddb.ts`:

```ts
import type { WrappingKeyStore } from "./keystore";

const DB_NAME = "faceback";
const STORE = "keys";
const KEY_ID = "wrappingKey";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const req = run(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export function createIndexedDbWrappingKeyStore(): WrappingKeyStore {
  return {
    async get() {
      const value = await tx<CryptoKey | undefined>("readonly", (s) => s.get(KEY_ID));
      return value ?? null;
    },
    async set(key) {
      await tx("readwrite", (s) => s.put(key, KEY_ID));
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/units/indexeddb.test.ts`
Expected: PASS.

Note: `fake-indexeddb` uses the structured clone algorithm, which preserves the `CryptoKey` object, matching real browser behavior. If this test ever fails to round-trip the key in a real browser, the fallback is to store the key material via `crypto.subtle.wrapKey` under a device passphrase; this is not needed for Phase 1.

- [ ] **Step 5: Commit**

```bash
git add web/src/units/indexeddb.ts web/src/units/indexeddb.test.ts
git commit -m "feat(web): persist the wrapping key in IndexedDB"
```

---

### Task 6: auth - create, read, and clear the local account

**Files:**
- Create: `web/src/units/auth.ts`
- Test: `web/src/units/auth.test.ts`

**Interfaces:**
- Consumes: `Account`, `WrappedKeyRecord` from `types.ts`; `hashPin`, `verifyPin`, `wrapApiKey`, `unwrapApiKey`, `WrappingKeyStore` from `keystore.ts`.
- Produces:
  - `createAccount(input: { username: string; email: string; apiKey: string; pin: string }, store: WrappingKeyStore): Promise<Account>`
  - `getAccount(): Account | null`
  - `isSignedIn(): boolean`
  - `signOut(): void`
  - `verifyAccountPin(pin: string): Promise<boolean>`
  - `revealApiKey(store: WrappingKeyStore): Promise<string>`

- [ ] **Step 1: Write the failing test**

Create `web/src/units/auth.test.ts`:

```ts
import { beforeEach, expect, test } from "vitest";
import {
  createAccount,
  getAccount,
  isSignedIn,
  signOut,
  verifyAccountPin,
  revealApiKey,
} from "./auth";
import { createMemoryWrappingKeyStore } from "./keystore";

beforeEach(() => localStorage.clear());

const input = {
  username: "charlie",
  email: "charlie@example.com",
  apiKey: "AIzaSy-fake-key",
  pin: "1234",
};

test("createAccount persists the account and signs the user in", async () => {
  expect(isSignedIn()).toBe(false);
  const account = await createAccount(input, createMemoryWrappingKeyStore());
  expect(account.username).toBe("charlie");
  expect(account.email).toBe("charlie@example.com");
  expect(getAccount()?.username).toBe("charlie");
  expect(isSignedIn()).toBe(true);
});

test("the raw PIN and API key are never stored in plaintext", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  const dump = JSON.stringify(localStorage);
  expect(dump).not.toContain("1234");
  expect(dump).not.toContain("AIzaSy-fake-key");
});

test("verifyAccountPin accepts the right PIN and rejects the wrong one", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  await expect(verifyAccountPin("1234")).resolves.toBe(true);
  await expect(verifyAccountPin("9999")).resolves.toBe(false);
});

test("revealApiKey returns the decrypted key using the same store", async () => {
  const store = createMemoryWrappingKeyStore();
  await createAccount(input, store);
  await expect(revealApiKey(store)).resolves.toBe("AIzaSy-fake-key");
});

test("signOut clears the account", async () => {
  await createAccount(input, createMemoryWrappingKeyStore());
  signOut();
  expect(getAccount()).toBeNull();
  expect(isSignedIn()).toBe(false);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/units/auth.test.ts`
Expected: FAIL - cannot find module `./auth`.

- [ ] **Step 3: Implement auth.ts**

Create `web/src/units/auth.ts`:

```ts
import type { Account, WrappedKeyRecord } from "../types";
import {
  hashPin,
  verifyPin,
  wrapApiKey,
  unwrapApiKey,
  type WrappingKeyStore,
} from "./keystore";

const ACCOUNT_KEY = "faceback.account";
const WRAPPED_KEY = "faceback.wrappedKey";

export async function createAccount(
  input: { username: string; email: string; apiKey: string; pin: string },
  store: WrappingKeyStore,
): Promise<Account> {
  const { hash, salt } = await hashPin(input.pin);
  const wrapped = await wrapApiKey(store, input.apiKey);
  const account: Account = {
    username: input.username,
    email: input.email,
    pinHash: hash,
    pinSalt: salt,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  localStorage.setItem(WRAPPED_KEY, JSON.stringify(wrapped));
  return account;
}

export function getAccount(): Account | null {
  const raw = localStorage.getItem(ACCOUNT_KEY);
  return raw ? (JSON.parse(raw) as Account) : null;
}

export function isSignedIn(): boolean {
  return getAccount() !== null;
}

export function signOut(): void {
  localStorage.removeItem(ACCOUNT_KEY);
  localStorage.removeItem(WRAPPED_KEY);
}

export async function verifyAccountPin(pin: string): Promise<boolean> {
  const account = getAccount();
  if (!account) return false;
  return verifyPin(pin, account.pinHash, account.pinSalt);
}

function getWrappedKey(): WrappedKeyRecord {
  const raw = localStorage.getItem(WRAPPED_KEY);
  if (!raw) throw new Error("No wrapped key stored");
  return JSON.parse(raw) as WrappedKeyRecord;
}

export async function revealApiKey(store: WrappingKeyStore): Promise<string> {
  return unwrapApiKey(store, getWrappedKey());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run src/units/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the whole suite and the type check**

Run: `cd web && npm test && npx tsc -b --noEmit`
Expected: all tests PASS and no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/units/auth.ts web/src/units/auth.test.ts
git commit -m "feat(web): add local account creation, PIN verification, and key reveal"
```

---

## Self-Review

**1. Spec coverage (for this plan's slice).**
- Account fields username/email/PIN + key, no password: Task 6 `createAccount`. Covered.
- PIN as a separate PBKDF2 hash, not encrypting the key: Tasks 3 and 4 are independent; `revealApiKey` needs no PIN, matching "generation never asks for PIN." Covered.
- Key encrypted at rest with a non-extractable WebCrypto key, wrapping key in IndexedDB: Tasks 4 and 5. Covered.
- Local-first storage (localStorage for account): Task 6. Covered.
- Scaffold + test environment with crypto and IndexedDB: Task 1. Covered.
- Deferred by design to later plans: functions, camera, faceGate, generationClient, collection, export, UI screens, skin. Listed in the plan series and file map, not gaps.

**2. Placeholder scan.** No TBD/TODO. Every code step shows complete code. The IndexedDB fallback note in Task 5 is a documented contingency, not a placeholder in the implementation.

**3. Type consistency.** `WrappingKeyStore` is defined in Task 4 and consumed unchanged in Tasks 5 and 6. `WrappedKeyRecord`, `Account` come from `types.ts` (Task 2) and are used with the same field names throughout. `bytesToB64`/`b64ToBytes` defined in Task 3 and reused in Task 4. `hashPin`/`verifyPin`/`wrapApiKey`/`unwrapApiKey` signatures match between keystore tasks and their auth consumer. Consistent.
