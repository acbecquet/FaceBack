# FaceBack Phase 1 - Plan 3: Remaining browser + storage units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining client-side units the UI will compose - image downscaling, on-device face detection, camera capture, the local collection store, and export to device - each with an injectable seam so its logic is unit-testable in Node while the browser-only calls stay thin.

**Architecture:** Small single-responsibility units under `web/src/units`. Browser APIs that jsdom cannot execute (canvas pixel resize, `getUserMedia`, `FaceDetector`) are isolated behind thin functions; the surrounding pure logic (size math, facing toggle, gate decisions, IndexedDB CRUD) is fully tested. The UI layer (Plan 4) wires these together.

**Tech Stack:** React/Vite/TypeScript app (existing), Vitest + jsdom, fake-indexeddb, the browser `FaceDetector`/`getUserMedia`/canvas APIs (thin, feature-detected).

## Global Constraints

Copied from `docs/superpowers/specs/2026-07-07-faceback-design.md`.

- Downscale before upload to `config.MAX_IMAGE_EDGE` (1024) longest edge to cut token cost.
- The ONLY hard input limit is face detection: an input with a detectable face is allowed at any framing. Where `FaceDetector` is unavailable, the gate degrades gracefully (does not block) while size/rate guards remain.
- Camera opens on the BACK camera by default (`facingMode: "environment"`), with a switch to the front (`"user"`).
- Collection supports multi-select delete (delete one or many).
- Save-to-Photos is a separate export action (a file download / Web Share on web; PhotoKit on iOS).
- `CollectionItem` shape (from `web/src/types.ts`): `{ id, imageBlob, mimeType, width, height, createdAt }`.
- Copy uses plain hyphens, never the em dash character.

## File structure (Plan 3 additions)

```
web/src/units/
  imageUtil.ts     imageUtil.test.ts     # size math (tested) + canvas downscale (thin) + base64<->blob
  faceGate.ts      faceGate.test.ts      # FaceDetector wrapper with fallback (tested via a mock)
  camera.ts        camera.test.ts        # getUserMedia controller; facing toggle (tested), media thin
  collection.ts    collection.test.ts    # IndexedDB CollectionItem CRUD + multi-delete (fake-indexeddb)
  export.ts        export.test.ts        # save blob to device (download / Web Share), tested via mocks
```

---

### Task 1: imageUtil - scaled-size math, downscale, and base64 helpers

**Files:**
- Create: `web/src/units/imageUtil.ts`
- Test: `web/src/units/imageUtil.test.ts`

**Interfaces:**
- Consumes: `config.MAX_IMAGE_EDGE`.
- Produces:
  - `computeScaledSize(width: number, height: number, maxEdge: number): { width: number; height: number }` - preserves aspect ratio; never upscales (if both sides <= maxEdge, returns the input rounded); scales the longest edge down to `maxEdge`.
  - `blobToBase64(blob: Blob): Promise<string>` - base64 (no data-URL prefix).
  - `downscaleImage(blob: Blob, maxEdge?: number): Promise<{ base64: string; mimeType: string; width: number; height: number }>` - draws to a canvas at the computed size and returns JPEG base64. (Browser-only canvas path; verified in Plan 4.)

- [ ] **Step 1: Write the failing test for the pure math + base64**

Create `web/src/units/imageUtil.test.ts`:

```ts
import { computeScaledSize, blobToBase64 } from "./imageUtil";

test("computeScaledSize scales the longest edge down to maxEdge, preserving aspect", () => {
  expect(computeScaledSize(4000, 2000, 1024)).toEqual({ width: 1024, height: 512 });
  expect(computeScaledSize(2000, 4000, 1024)).toEqual({ width: 512, height: 1024 });
});

test("computeScaledSize never upscales a small image", () => {
  expect(computeScaledSize(800, 600, 1024)).toEqual({ width: 800, height: 600 });
});

test("computeScaledSize rounds to whole pixels", () => {
  const { width, height } = computeScaledSize(1000, 333, 500);
  expect(Number.isInteger(width)).toBe(true);
  expect(Number.isInteger(height)).toBe(true);
  expect(width).toBe(500);
});

test("blobToBase64 returns the base64 body without a data-URL prefix", async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "application/octet-stream" });
  const b64 = await blobToBase64(blob);
  expect(b64).toBe(btoa(String.fromCharCode(1, 2, 3, 4)));
  expect(b64).not.toContain(",");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/units/imageUtil.test.ts`
Expected: FAIL - cannot find module `./imageUtil`.

- [ ] **Step 3: Implement imageUtil**

Create `web/src/units/imageUtil.ts`:

```ts
import { config } from "./config";

export function computeScaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

// Browser-only: draws the image to a canvas at the downscaled size and returns
// JPEG base64. jsdom cannot execute canvas rendering, so this path is verified
// in the Plan 4 browser run; the size math above is unit-tested.
export async function downscaleImage(
  blob: Blob,
  maxEdge: number = config.MAX_IMAGE_EDGE,
): Promise<{ base64: string; mimeType: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = computeScaledSize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const outBlob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9),
  );
  return { base64: await blobToBase64(outBlob), mimeType: "image/jpeg", width, height };
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `cd web && npx vitest run src/units/imageUtil.test.ts` (expect 4 passing) and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/units/imageUtil.ts web/src/units/imageUtil.test.ts
git commit -m "feat(web): add image downscale size math, canvas downscale, and base64 helper"
```

---

### Task 2: faceGate - on-device face detection with graceful fallback

**Files:**
- Create: `web/src/units/faceGate.ts`
- Test: `web/src/units/faceGate.test.ts`

**Interfaces:**
- Produces:
  - `type FaceGateResult = { supported: boolean; faceCount: number }`
  - `detectFaces(source: CanvasImageSource): Promise<FaceGateResult>` - uses the global `FaceDetector` if present; when unsupported returns `{ supported: false, faceCount: 0 }`.
  - `hasDetectableFace(result: FaceGateResult): boolean` - the INPUT gate: `true` when a face is found OR detection is unsupported (degrade-open), `false` only when detection is supported and found zero faces.
  - `looksLikeBackOfHead(result: FaceGateResult): boolean` - the OUTPUT suspicion heuristic used by the hybrid loop: `true` (acceptable) when unsupported OR zero faces; `false` (suspicious) when a face is detected in a result that should show the back of the head.

- [ ] **Step 1: Write the failing test (mock a global FaceDetector)**

Create `web/src/units/faceGate.test.ts`:

```ts
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { detectFaces, hasDetectableFace, looksLikeBackOfHead } from "./faceGate";

const original = (globalThis as any).FaceDetector;
afterEach(() => {
  (globalThis as any).FaceDetector = original;
});

function mockFaceDetector(count: number) {
  (globalThis as any).FaceDetector = class {
    async detect() {
      return Array.from({ length: count });
    }
  };
}

test("detectFaces reports the count when FaceDetector is supported", async () => {
  mockFaceDetector(2);
  const r = await detectFaces({} as CanvasImageSource);
  expect(r).toEqual({ supported: true, faceCount: 2 });
});

test("detectFaces reports unsupported when FaceDetector is absent", async () => {
  (globalThis as any).FaceDetector = undefined;
  const r = await detectFaces({} as CanvasImageSource);
  expect(r).toEqual({ supported: false, faceCount: 0 });
});

test("hasDetectableFace gates: face -> true, no face -> false, unsupported -> true (degrade open)", () => {
  expect(hasDetectableFace({ supported: true, faceCount: 1 })).toBe(true);
  expect(hasDetectableFace({ supported: true, faceCount: 0 })).toBe(false);
  expect(hasDetectableFace({ supported: false, faceCount: 0 })).toBe(true);
});

test("looksLikeBackOfHead: a detected face is suspicious, no face / unsupported is acceptable", () => {
  expect(looksLikeBackOfHead({ supported: true, faceCount: 1 })).toBe(false);
  expect(looksLikeBackOfHead({ supported: true, faceCount: 0 })).toBe(true);
  expect(looksLikeBackOfHead({ supported: false, faceCount: 0 })).toBe(true);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/units/faceGate.test.ts`
Expected: FAIL - cannot find module `./faceGate`.

- [ ] **Step 3: Implement faceGate**

Create `web/src/units/faceGate.ts`:

```ts
export type FaceGateResult = { supported: boolean; faceCount: number };

export async function detectFaces(source: CanvasImageSource): Promise<FaceGateResult> {
  const Detector = (globalThis as any).FaceDetector;
  if (typeof Detector !== "function") return { supported: false, faceCount: 0 };
  try {
    const detector = new Detector();
    const faces = await detector.detect(source);
    return { supported: true, faceCount: Array.isArray(faces) ? faces.length : 0 };
  } catch {
    // A detector that throws is treated as unsupported (degrade open).
    return { supported: false, faceCount: 0 };
  }
}

// INPUT gate: allow when a face is present, or when detection is unavailable
// (degrade open so users on browsers without FaceDetector are not blocked).
export function hasDetectableFace(result: FaceGateResult): boolean {
  return !result.supported || result.faceCount > 0;
}

// OUTPUT suspicion heuristic for the hybrid loop: a correct back-of-head result
// should have NO detectable face. A detected face means "suspicious, regenerate".
export function looksLikeBackOfHead(result: FaceGateResult): boolean {
  return !result.supported || result.faceCount === 0;
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `cd web && npx vitest run src/units/faceGate.test.ts` (expect 4 passing) and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/units/faceGate.ts web/src/units/faceGate.test.ts
git commit -m "feat(web): add on-device face-gate with graceful fallback and output heuristic"
```

---

### Task 3: camera - capture controller

**Files:**
- Create: `web/src/units/camera.ts`
- Test: `web/src/units/camera.test.ts`

**Interfaces:**
- Produces:
  - `type Facing = "environment" | "user"`
  - `otherFacing(f: Facing): Facing`
  - `startStream(facing: Facing, md?: MediaDevices): Promise<MediaStream>` - calls `getUserMedia({ video: { facingMode: facing }, audio: false })`.
  - `stopStream(stream: MediaStream): void` - stops every track.
  - `captureFrame(video: HTMLVideoElement): Promise<Blob>` - draws the current frame to a canvas and returns a JPEG blob. (Browser-only; verified in Plan 4.)

- [ ] **Step 1: Write the failing test (pure toggle + start/stop with a mock MediaDevices)**

Create `web/src/units/camera.test.ts`:

```ts
import { otherFacing, startStream, stopStream } from "./camera";

test("otherFacing toggles between environment and user", () => {
  expect(otherFacing("environment")).toBe("user");
  expect(otherFacing("user")).toBe("environment");
});

test("startStream requests the given facingMode with audio off", async () => {
  let captured: MediaStreamConstraints | undefined;
  const md = {
    getUserMedia: async (c: MediaStreamConstraints) => {
      captured = c;
      return {} as MediaStream;
    },
  } as unknown as MediaDevices;

  await startStream("environment", md);
  expect(captured).toEqual({ video: { facingMode: "environment" }, audio: false });
});

test("stopStream stops every track", () => {
  const stops: number[] = [];
  const stream = {
    getTracks: () => [
      { stop: () => stops.push(1) },
      { stop: () => stops.push(2) },
    ],
  } as unknown as MediaStream;
  stopStream(stream);
  expect(stops).toEqual([1, 2]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/units/camera.test.ts`
Expected: FAIL - cannot find module `./camera`.

- [ ] **Step 3: Implement camera**

Create `web/src/units/camera.ts`:

```ts
export type Facing = "environment" | "user";

export function otherFacing(f: Facing): Facing {
  return f === "environment" ? "user" : "environment";
}

export function startStream(
  facing: Facing,
  md: MediaDevices = navigator.mediaDevices,
): Promise<MediaStream> {
  return md.getUserMedia({ video: { facingMode: facing }, audio: false });
}

export function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

// Browser-only: draw the current video frame to a canvas and return a JPEG blob.
// Verified in the Plan 4 browser run.
export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92),
  );
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `cd web && npx vitest run src/units/camera.test.ts` (expect 3 passing) and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/units/camera.ts web/src/units/camera.test.ts
git commit -m "feat(web): add camera capture controller with facing toggle"
```

---

### Task 4: collection - IndexedDB store with multi-delete

**Files:**
- Create: `web/src/units/collection.ts`
- Test: `web/src/units/collection.test.ts`

**Interfaces:**
- Consumes: `CollectionItem` from `web/src/types.ts`.
- Produces:
  - `addItem(item: CollectionItem): Promise<void>`
  - `listItems(): Promise<CollectionItem[]>` - newest first (descending `createdAt`).
  - `deleteItems(ids: string[]): Promise<void>` - removes one or many by id.
  - Uses an IndexedDB object store `collection` (keyPath `id`) in a DEDICATED `faceback-collection` database (kept separate from the keystore's `faceback` DB so the two openers never fight over a schema version).

- [ ] **Step 1: Write the failing test (fake-indexeddb)**

Create `web/src/units/collection.test.ts`:

```ts
import { afterEach, expect, test } from "vitest";
import { addItem, listItems, deleteItems } from "./collection";
import type { CollectionItem } from "../types";

afterEach(
  () =>
    new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("faceback-collection");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    }),
);

function item(id: string, createdAt: string): CollectionItem {
  return {
    id,
    imageBlob: new Blob([id], { type: "image/jpeg" }),
    mimeType: "image/jpeg",
    width: 10,
    height: 10,
    createdAt,
  };
}

test("addItem then listItems returns stored items, newest first", async () => {
  await addItem(item("a", "2026-01-01T00:00:00.000Z"));
  await addItem(item("b", "2026-01-02T00:00:00.000Z"));
  const items = await listItems();
  expect(items.map((i) => i.id)).toEqual(["b", "a"]);
});

test("deleteItems removes multiple items by id", async () => {
  await addItem(item("a", "2026-01-01T00:00:00.000Z"));
  await addItem(item("b", "2026-01-02T00:00:00.000Z"));
  await addItem(item("c", "2026-01-03T00:00:00.000Z"));
  await deleteItems(["a", "c"]);
  const items = await listItems();
  expect(items.map((i) => i.id)).toEqual(["b"]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/units/collection.test.ts`
Expected: FAIL - cannot find module `./collection`.

- [ ] **Step 3: Implement collection**

Create `web/src/units/collection.ts`:

```ts
import type { CollectionItem } from "../types";

// A dedicated database, separate from the keystore's "faceback" DB, so the two
// have independent schema versions and their openers never conflict.
const DB_NAME = "faceback-collection";
const STORE = "collection";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result: T;
        const req = fn(store);
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => {
          db.close();
          resolve(result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
        t.onabort = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

export async function addItem(item: CollectionItem): Promise<void> {
  await run("readwrite", (s) => s.put(item));
}

export async function listItems(): Promise<CollectionItem[]> {
  const items = await run<CollectionItem[]>("readonly", (s) => s.getAll() as IDBRequest<CollectionItem[]>);
  return (items ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteItems(ids: string[]): Promise<void> {
  await run("readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `cd web && npx vitest run src/units/collection.test.ts` (expect 2 passing), `cd web && npx vitest run` (full web suite green), and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/units/collection.ts web/src/units/collection.test.ts
git commit -m "feat(web): add IndexedDB collection store with multi-delete"
```

---

### Task 5: export - save an image to the device

**Files:**
- Create: `web/src/units/export.ts`
- Test: `web/src/units/export.test.ts`

**Interfaces:**
- Produces: `saveImageToDevice(blob: Blob, filename: string, deps?: { anchor?: () => HTMLAnchorElement; createUrl?: (b: Blob) => string; revokeUrl?: (u: string) => void }): void` - triggers a download via a temporary object-URL anchor. Dependencies are injectable so the click/URL flow is testable without a real DOM download.

- [ ] **Step 1: Write the failing test**

Create `web/src/units/export.test.ts`:

```ts
import { saveImageToDevice } from "./export";

test("saveImageToDevice sets the anchor href/download, clicks, and revokes the url", () => {
  const events: string[] = [];
  const anchorEl = {
    href: "",
    download: "",
    click() {
      events.push(`click:${this.download}:${this.href}`);
    },
  } as unknown as HTMLAnchorElement;

  const blob = new Blob(["x"], { type: "image/jpeg" });
  saveImageToDevice(blob, "back-of-head.jpg", {
    anchor: () => anchorEl,
    createUrl: () => "blob:fake-url",
    revokeUrl: (u) => events.push(`revoke:${u}`),
  });

  expect(anchorEl.download).toBe("back-of-head.jpg");
  expect(anchorEl.href).toBe("blob:fake-url");
  expect(events).toContain("click:back-of-head.jpg:blob:fake-url");
  expect(events).toContain("revoke:blob:fake-url");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx vitest run src/units/export.test.ts`
Expected: FAIL - cannot find module `./export`.

- [ ] **Step 3: Implement export**

Create `web/src/units/export.ts`:

```ts
export function saveImageToDevice(
  blob: Blob,
  filename: string,
  deps: {
    anchor?: () => HTMLAnchorElement;
    createUrl?: (b: Blob) => string;
    revokeUrl?: (u: string) => void;
  } = {},
): void {
  const anchor = deps.anchor ?? (() => document.createElement("a"));
  const createUrl = deps.createUrl ?? ((b) => URL.createObjectURL(b));
  const revokeUrl = deps.revokeUrl ?? ((u) => URL.revokeObjectURL(u));

  const url = createUrl(blob);
  const a = anchor();
  a.href = url;
  a.download = filename;
  a.click();
  revokeUrl(url);
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `cd web && npx vitest run src/units/export.test.ts` (expect 1 passing), `cd web && npx vitest run` (full web suite green), and `cd web && npx tsc --noEmit` (clean).

```bash
git add web/src/units/export.ts web/src/units/export.test.ts
git commit -m "feat(web): add save-to-device export via an injectable download anchor"
```

---

## Self-Review

**1. Spec coverage.** Downscale to MAX_IMAGE_EDGE (Task 1); face-gate as the only hard input limit with graceful fallback + the output suspicion heuristic that completes the hybrid loop in Plan 4 (Task 2); back-camera-default facing with a toggle + capture (Task 3); collection with multi-delete (Task 4); separate save-to-device export (Task 5). The canvas/getUserMedia/FaceDetector browser calls are thin and flagged for verification in Plan 4's browser run. Covered.

**2. Placeholder scan.** No TBD/TODO. Every code step is complete. The "verified in Plan 4" notes mark browser-only paths that jsdom cannot execute, not missing code.

**3. Type consistency.** `CollectionItem` matches `web/src/types.ts` exactly (Task 4). `FaceGateResult` defined and consumed within Task 2. `Facing` defined and used within Task 3. `config.MAX_IMAGE_EDGE` (from Plan 1) used by Task 1. Injectable-deps signatures match their tests in Tasks 3 and 5. Consistent.
