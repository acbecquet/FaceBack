# FaceBack Hosted - Plan 03: Keys, Allowlist Admin, and Generation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the backend: the email-code-gated key view/edit flow, the dev-owner-only allowlist admin endpoints, and the authenticated generate endpoint that selects the caller's own key or the shared dev key (with caps) and runs the Phase 1 hardened generation pipeline.

**Architecture:** New handlers in `shared/handlers/` compose the Plan 01/02 units. A short-lived `typ:"key-edit"` capability token (distinct from the `typ:"session"` token, same secret) authorizes key writes after a fresh email code. The generate handler resolves the caller via `getAuthedAccount`, picks the key server-side, enforces caps for dev-key use, and reuses the Phase 1 tamper-proof prompt + Gemini client + plausibility-retry loop. The Gemini client is injected so tests never hit the network.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, D1, KV, Google Gemini Interactions API (via `fetch`), Vitest with `@cloudflare/vitest-pool-workers`.

## Global Constraints

- Key writes and reveals are gated by a fresh email code (purpose `"key"`), then a short-lived `typ:"key-edit"` capability token (5-minute TTL) signed with `SESSION_SECRET`. `verifyKeyToken` enforces `typ:"key-edit"`; it must reject a `typ:"session"` token, and `verifySession` must reject a `typ:"key-edit"` token.
- Every authenticated handler resolves the caller with `getAuthedAccount(req, env)` (Plan 02) and returns 401 when it is null.
- The stored key is only ever decrypted transiently to (a) return to its OWN owner after a fresh code, or (b) call Gemini server-side. It is never logged and never returned by generate.
- Allowlist admin endpoints (`GET/POST/DELETE /api/dev/allowlist`) require `account.isDev === true`; a signed-in non-dev caller gets 403, an anonymous caller 401.
- Generate key selection (spec §3.4): if `account.isDev` OR the caller's email is on the dev allowlist, use the dev account's key and enforce caps; otherwise use the caller's own stored key (400 `no_key` if absent). Allowlist membership takes precedence over a caller's own key.
- Caps (spec §7): before any dev-key generation, block with 429 `daily_limit` if `overCap(getUsage(env, email, now), account.isDev)`; increment usage only after a successful generation. The owner (`isDev`) is exempt from the per-friend cap but counts toward the global cap (this is exactly what `overCap(usage, isOwner)` already implements).
- Generation reuses `BACK_OF_HEAD_PROMPT` (shared/prompt.ts) verbatim and the Phase 1 pipeline: up to 2 attempts, plausibility check (base64 length >= 100), `GeminiError` mapped to 429 (rate) or 502 (other), unexpected error to 500. The client never sends a key and never sees the prompt.
- The dev account id is the seeded `"acc_dev"`; reference it via a single exported `DEV_ACCOUNT_ID` constant.
- `errorResponse(code: string, message: string, status: number)` and `json(data, status = 200)` - correct argument order (the earlier plans' inline examples had it reversed).
- No em dash characters, no emoji. Reuse units; do not reimplement crypto/session/DAL/gemini logic.

## File Structure

- `shared/auth/keyToken.ts` (create) - `signKeyToken`, `verifyKeyToken`.
- `shared/handlers/key/challenge.ts`, `reveal.ts`, `edit.ts` (create) - key view/edit flow.
- `shared/handlers/dev/allowlist.ts` (create) - `handleListAllowlist`, `handleAddAllowlist`, `handleRemoveAllowlist` (+ internal `requireDevOwner`).
- `shared/handlers/generate.ts` (create) - the authenticated hosted generate handler.
- `shared/data/accounts.ts` (modify) - add `export const DEV_ACCOUNT_ID = "acc_dev";`.
- `functions/api/key/challenge.ts`, `reveal.ts`, `index.ts` (create) - POST challenge, POST reveal, PUT edit.
- `functions/api/dev/allowlist.ts` (create) - GET/POST/DELETE.
- `functions/api/generate.ts` (create) - POST generate.
- Delete `functions/src/generate.ts`, `functions/src/generate.test.ts` (the Phase 1 body-key handler; superseded by `shared/handlers/generate.ts`). Its plausibility loop and GeminiError handling move into the new handler.

---

### Task 1: Key-edit capability token

**Files:** Create `shared/auth/keyToken.ts`, `shared/auth/keyToken.test.ts`.
**Interfaces produced:** `signKeyToken(accountId, secret, nowMs): Promise<string>`, `verifyKeyToken(token, secret, nowMs): Promise<string | null>`.

- [ ] **Step 1: Failing test** (`shared/auth/keyToken.test.ts`)

```ts
import { expect, test } from "vitest";
import { signKeyToken, verifyKeyToken } from "./keyToken";
import { signSession, verifySession } from "./session";

const SECRET = "s";
const NOW = 1_800_000_000_000;

test("key token round-trips and yields the account id", async () => {
  const t = await signKeyToken("acc_1", SECRET, NOW);
  await expect(verifyKeyToken(t, SECRET, NOW + 1000)).resolves.toBe("acc_1");
});

test("a session token is NOT accepted as a key-edit token, and vice versa", async () => {
  const session = await signSession("acc_1", SECRET, NOW);
  await expect(verifyKeyToken(session, SECRET, NOW)).resolves.toBeNull();
  const key = await signKeyToken("acc_1", SECRET, NOW);
  await expect(verifySession(key, SECRET, NOW)).resolves.toBeNull();
});

test("expires after 5 minutes", async () => {
  const t = await signKeyToken("acc_1", SECRET, NOW);
  await expect(verifyKeyToken(t, SECRET, NOW + 6 * 60 * 1000)).resolves.toBeNull();
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run shared/auth/keyToken.test.ts`
- [ ] **Step 3: Implement `shared/auth/keyToken.ts`**

```ts
import { signToken, verifyToken } from "../tokens";

const KEY_EDIT_TTL_SECONDS = 5 * 60;

export async function signKeyToken(accountId: string, secret: string, nowMs: number): Promise<string> {
  return signToken(secret, { sub: accountId, typ: "key-edit" }, KEY_EDIT_TTL_SECONDS, nowMs);
}

export async function verifyKeyToken(token: string, secret: string, nowMs: number): Promise<string | null> {
  const payload = await verifyToken(secret, token, nowMs);
  if (!payload) return null;
  if (payload.typ !== "key-edit") return null;
  return typeof payload.sub === "string" ? payload.sub : null;
}
```

- [ ] **Step 4: Run, verify pass.** Then `npm test` + `npm run typecheck` + `npm --prefix functions run typecheck` clean.
- [ ] **Step 5: Commit.** `git add shared/auth/keyToken.ts shared/auth/keyToken.test.ts && git commit -m "feat(hosted): key-edit capability token (typ:key-edit, 5-min)"`

---

### Task 2: Key challenge, reveal, and edit handlers

**Files:** Create `shared/handlers/key/{challenge,reveal,edit}.ts`, `functions/api/key/{challenge,reveal,index}.ts`, and tests `shared/handlers/key/{challenge,reveal,edit}.test.ts`.
**Interfaces consumed:** `getAuthedAccount` (requestAuth); `issueCode`/`verifyStoredCode` (codeStore, purpose `"key"`); `getAccountKeyCipher`/`setAccountKey` (accounts); `encryptApiKey`/`decryptApiKey` (keyCipher); `signKeyToken`/`verifyKeyToken` (keyToken); `EmailProvider`/`createResendProvider`/`FROM_ADDRESS` (email); `json`/`errorResponse` (http).
**Interfaces produced:** `handleKeyChallenge(req, env, email)`, `handleKeyReveal(req, env)`, `handleKeyEdit(req, env)`.

- [ ] **Step 1: challenge test + impl**

Test (`challenge.test.ts`): a signed-in caller gets 200 and a `"key"`-purpose code is emailed to `account.email`; an anonymous caller gets 401 and no email. Build a signed-in request with `Authorization: Bearer <signSession(acc.id, env.SESSION_SECRET, Date.now())>`.

```ts
// challenge.ts
import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import { issueCode } from "../../auth/codeStore";
import type { EmailProvider } from "../../email";

export async function handleKeyChallenge(req: Request, env: Env, email: EmailProvider): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  const code = await issueCode(env, "key", account.email);
  await email.sendCode({ to: account.email, code, purpose: "key" });
  return json({ pending: true });
}
```

- [ ] **Step 2: reveal test + impl**

Test (`reveal.test.ts`): with a stored key and a valid `"key"` code, returns `{ apiKey: <decrypted>, editToken }` and the editToken verifies via `verifyKeyToken`; with no stored key, returns `{ apiKey: null, editToken }`; a wrong code returns 401 `bad_code`; anonymous 401. Seed the key with `encryptApiKey` + `setAccountKey`, and the code with `issueCode(env, "key", account.email)`.

```ts
// reveal.ts
import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import { verifyStoredCode } from "../../auth/codeStore";
import { getAccountKeyCipher } from "../../data/accounts";
import { decryptApiKey } from "../../crypto/keyCipher";
import { signKeyToken } from "../../auth/keyToken";

export async function handleKeyReveal(req: Request, env: Env): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return errorResponse("bad_input", "Code is required.", 400);
  if (!(await verifyStoredCode(env, "key", account.email, code)))
    return errorResponse("bad_code", "Invalid or expired code.", 401);
  const cipher = await getAccountKeyCipher(env, account.id);
  const apiKey = cipher ? await decryptApiKey(cipher.ciphertext, cipher.iv, env.KEY_ENC_SECRET) : null;
  const editToken = await signKeyToken(account.id, env.SESSION_SECRET, Date.now());
  return json({ apiKey, editToken });
}
```

- [ ] **Step 3: edit test + impl**

Test (`edit.test.ts`): with a valid editToken (from `signKeyToken(acc.id, ...)`) and an apiKey, stores it (verify via `getAccountKeyCipher` + `decryptApiKey` round-trip equals the new key); a missing/invalid editToken returns 401; an editToken for a DIFFERENT account returns 401; anonymous 401; empty apiKey 400.

```ts
// edit.ts
import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import { verifyKeyToken } from "../../auth/keyToken";
import { encryptApiKey } from "../../crypto/keyCipher";
import { setAccountKey } from "../../data/accounts";

export async function handleKeyEdit(req: Request, env: Env): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  const body = (await req.json().catch(() => null)) as { apiKey?: unknown; editToken?: unknown } | null;
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  const editToken = typeof body?.editToken === "string" ? body.editToken : "";
  if (!apiKey) return errorResponse("bad_input", "An API key is required.", 400);
  const authedId = editToken ? await verifyKeyToken(editToken, env.SESSION_SECRET, Date.now()) : null;
  if (authedId !== account.id)
    return errorResponse("unauthorized", "A fresh key-edit authorization is required.", 401);
  const { ciphertext, iv } = await encryptApiKey(apiKey, env.KEY_ENC_SECRET);
  await setAccountKey(env, account.id, ciphertext, iv);
  return json({ ok: true });
}
```

- [ ] **Step 4: Route adapters**

```ts
// functions/api/key/challenge.ts
import type { Env } from "../../../shared/env";
import { handleKeyChallenge } from "../../../shared/handlers/key/challenge";
import { createResendProvider, FROM_ADDRESS } from "../../../shared/email";
export const onRequestPost = (ctx: { request: Request; env: Env }) =>
  handleKeyChallenge(ctx.request, ctx.env, createResendProvider(ctx.env.RESEND_API_KEY, FROM_ADDRESS));
```
```ts
// functions/api/key/reveal.ts
import type { Env } from "../../../shared/env";
import { handleKeyReveal } from "../../../shared/handlers/key/reveal";
export const onRequestPost = (ctx: { request: Request; env: Env }) => handleKeyReveal(ctx.request, ctx.env);
```
```ts
// functions/api/key/index.ts  (PUT /api/key)
import type { Env } from "../../../shared/env";
import { handleKeyEdit } from "../../../shared/handlers/key/edit";
export const onRequestPut = (ctx: { request: Request; env: Env }) => handleKeyEdit(ctx.request, ctx.env);
```

- [ ] **Step 5:** `npm test` + both typechecks clean. Commit `feat(hosted): key challenge/reveal/edit (email-code gated)`.

---

### Task 3: Dev allowlist admin endpoints

**Files:** Create `shared/handlers/dev/allowlist.ts`, `functions/api/dev/allowlist.ts`, `shared/handlers/dev/allowlist.test.ts`.
**Interfaces consumed:** `getAuthedAccount`; `listAllowlist`/`addToAllowlist`/`removeFromAllowlist` (allowlist); `json`/`errorResponse`.
**Interfaces produced:** `handleListAllowlist(req, env)`, `handleAddAllowlist(req, env)`, `handleRemoveAllowlist(req, env)`.

- [ ] **Step 1: Test** (`allowlist.test.ts`): the seeded dev account (sign a session for `DEV_ACCOUNT_ID`) can add an email, list it, and remove it; a signed-in NON-dev account gets 403 on all three and does not mutate the list; an anonymous request gets 401. (Create a normal account for the non-dev case; the dev account is seeded by migration 0002.)

- [ ] **Step 2: Run, verify fail; implement `shared/handlers/dev/allowlist.ts`**

```ts
import type { Env } from "../../env";
import type { Account } from "../../data/accounts";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import { listAllowlist, addToAllowlist, removeFromAllowlist } from "../../data/allowlist";

async function requireDevOwner(req: Request, env: Env): Promise<Account | Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  if (!account.isDev) return errorResponse("forbidden", "Not allowed.", 403);
  return account;
}

export async function handleListAllowlist(req: Request, env: Env): Promise<Response> {
  const gate = await requireDevOwner(req, env);
  if (gate instanceof Response) return gate;
  return json({ emails: await listAllowlist(env) });
}

function parseEmail(body: unknown): string | null {
  const o = (body ?? {}) as Record<string, unknown>;
  if (typeof o.email !== "string") return null;
  const email = o.email.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export async function handleAddAllowlist(req: Request, env: Env): Promise<Response> {
  const gate = await requireDevOwner(req, env);
  if (gate instanceof Response) return gate;
  const email = parseEmail(await req.json().catch(() => null));
  if (!email) return errorResponse("bad_input", "A valid email is required.", 400);
  await addToAllowlist(env, email);
  return json({ ok: true });
}

export async function handleRemoveAllowlist(req: Request, env: Env): Promise<Response> {
  const gate = await requireDevOwner(req, env);
  if (gate instanceof Response) return gate;
  const email = parseEmail(await req.json().catch(() => null));
  if (!email) return errorResponse("bad_input", "A valid email is required.", 400);
  await removeFromAllowlist(env, email);
  return json({ ok: true });
}
```

- [ ] **Step 3: Route adapter** `functions/api/dev/allowlist.ts`

```ts
import type { Env } from "../../../shared/env";
import { handleListAllowlist, handleAddAllowlist, handleRemoveAllowlist } from "../../../shared/handlers/dev/allowlist";
export const onRequestGet = (ctx: { request: Request; env: Env }) => handleListAllowlist(ctx.request, ctx.env);
export const onRequestPost = (ctx: { request: Request; env: Env }) => handleAddAllowlist(ctx.request, ctx.env);
export const onRequestDelete = (ctx: { request: Request; env: Env }) => handleRemoveAllowlist(ctx.request, ctx.env);
```

- [ ] **Step 4:** `npm test` + both typechecks clean. Commit `feat(hosted): dev-owner allowlist admin endpoints`.

---

### Task 4: Authenticated generate endpoint

**Files:** Modify `shared/data/accounts.ts` (add `DEV_ACCOUNT_ID`). Create `shared/handlers/generate.ts`, `functions/api/generate.ts`, `shared/handlers/generate.test.ts`. Delete `functions/src/generate.ts`, `functions/src/generate.test.ts`.
**Interfaces consumed:** `getAuthedAccount`; `isAllowlisted` (allowlist); `getUsage`/`incrementUsage`/`overCap` (usage); `getAccountKeyCipher`/`DEV_ACCOUNT_ID` (accounts); `decryptApiKey` (keyCipher); `BACK_OF_HEAD_PROMPT` (prompt); `createGeminiClient`/`GeminiClient`/`GeminiError`/`GeneratedImage` (gemini); `json`/`errorResponse`.
**Interfaces produced:** `handleGenerate(req, env, deps: { makeClient: (apiKey: string) => GeminiClient })`.

- [ ] **Step 1: Add the dev-account id constant.** In `shared/data/accounts.ts` add `export const DEV_ACCOUNT_ID = "acc_dev";` (matches migration 0002).

- [ ] **Step 2: Failing test** (`shared/handlers/generate.test.ts`)

Use a fake client via injected `makeClient`. Helper to build a signed-in request and to give an account a key.

```ts
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleGenerate } from "./generate";
import { createAccount, setAccountKey, getAccountById, DEV_ACCOUNT_ID } from "../data/accounts";
import { addToAllowlist } from "../data/allowlist";
import { getUsage } from "../data/usage";
import { signSession } from "../auth/session";
import { encryptApiKey } from "../crypto/keyCipher";
import { GeminiError, type GeminiClient } from "../gemini";

const IMG = { base64: "AAAABBBBCCCC", mimeType: "image/jpeg" };
const GOOD = "x".repeat(200);

function okClient(): GeminiClient {
  return { async generateImage() { return { imageBase64: GOOD, mimeType: "image/jpeg" }; } };
}
function makeOk() { return () => okClient(); }

async function giveKey(id: string, key: string) {
  const { ciphertext, iv } = await encryptApiKey(key, env.KEY_ENC_SECRET);
  await setAccountKey(env, id, ciphertext, iv);
}
function signedReq(accId: string, image: unknown = IMG): Request {
  const token = "" ; // replaced below
  return new Request("http://x/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ image }),
  });
}

test("a normal user with their own key generates using it", async () => {
  const acc = await createAccount(env, { username: "gen1", email: "gen1@example.com" });
  await giveKey(acc.id, "user-key");
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ image: IMG }),
  });
  const res = await handleGenerate(req, env, makeOk());
  expect(res.status).toBe(200);
  const body = await res.json() as { image: { base64: string } };
  expect(body.image.base64).toBe(GOOD);
});

test("a user with no key (not dev, not allowlisted) gets 400 no_key", async () => {
  const acc = await createAccount(env, { username: "gen2", email: "gen2@example.com" });
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const req = new Request("http://x/api/generate", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image: IMG }),
  });
  const res = await handleGenerate(req, env, makeOk());
  expect(res.status).toBe(400);
});

test("an allow-listed friend uses the dev key and increments usage", async () => {
  await giveKey(DEV_ACCOUNT_ID, "dev-key"); // dev account seeded by migration
  const friend = await createAccount(env, { username: "friend", email: "friend@example.com" });
  await addToAllowlist(env, "friend@example.com");
  const token = await signSession(friend.id, env.SESSION_SECRET, Date.now());
  let usedKey = "";
  const spyMake = (k: string) => { usedKey = k; return okClient(); };
  const req = new Request("http://x/api/generate", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image: IMG }),
  });
  const res = await handleGenerate(req, env, spyMake);
  expect(res.status).toBe(200);
  expect(usedKey).toBe("dev-key");
  expect((await getUsage(env, "friend@example.com", Date.now())).friend).toBe(1);
});

test("anonymous request is 401; a Gemini 429 maps to 429", async () => {
  const anon = new Request("http://x/api/generate", { method: "POST", body: JSON.stringify({ image: IMG }) });
  expect((await handleGenerate(anon, env, makeOk())).status).toBe(401);

  const acc = await createAccount(env, { username: "gen3", email: "gen3@example.com" });
  await giveKey(acc.id, "k");
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const throw429: () => GeminiClient = () => ({ async generateImage() { throw new GeminiError("rate", 429); } });
  const req = new Request("http://x/api/generate", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image: IMG }),
  });
  expect((await handleGenerate(req, env, throw429)).status).toBe(429);
});
```

- [ ] **Step 3: Run, verify fail; implement `shared/handlers/generate.ts`**

```ts
import type { Env } from "../env";
import { json, errorResponse } from "../http";
import { getAuthedAccount } from "../auth/requestAuth";
import { isAllowlisted } from "../data/allowlist";
import { getUsage, incrementUsage, overCap } from "../data/usage";
import { getAccountKeyCipher, DEV_ACCOUNT_ID } from "../data/accounts";
import { decryptApiKey } from "../crypto/keyCipher";
import { BACK_OF_HEAD_PROMPT } from "../prompt";
import { GeminiError, type GeminiClient, type GeneratedImage } from "../gemini";

const MIN_IMAGE_BASE64 = 100;
const isPlausible = (img: GeneratedImage): boolean =>
  typeof img.imageBase64 === "string" && img.imageBase64.length >= MIN_IMAGE_BASE64;

export async function handleGenerate(
  req: Request,
  env: Env,
  deps: { makeClient: (apiKey: string) => GeminiClient },
): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);

  const body = (await req.json().catch(() => null)) as { image?: { base64?: unknown; mimeType?: unknown } } | null;
  const image = body?.image;
  if (typeof image?.base64 !== "string" || !image.base64 || typeof image?.mimeType !== "string" || !image.mimeType) {
    return errorResponse("bad_input", "Expected { image: { base64, mimeType } }", 400);
  }

  const now = Date.now();
  const usesDevKey = account.isDev || (await isAllowlisted(env, account.email));
  let apiKey: string;
  if (usesDevKey) {
    if (overCap(await getUsage(env, account.email, now), account.isDev))
      return errorResponse("daily_limit", "Daily limit reached. Try again tomorrow.", 429);
    const cipher = await getAccountKeyCipher(env, DEV_ACCOUNT_ID);
    if (!cipher) return errorResponse("dev_key_unset", "The shared key is not configured yet.", 503);
    apiKey = await decryptApiKey(cipher.ciphertext, cipher.iv, env.KEY_ENC_SECRET);
  } else {
    const cipher = await getAccountKeyCipher(env, account.id);
    if (!cipher) return errorResponse("no_key", "Add your Gemini key first.", 400);
    apiKey = await decryptApiKey(cipher.ciphertext, cipher.iv, env.KEY_ENC_SECRET);
  }

  const client = deps.makeClient(apiKey);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await client.generateImage(BACK_OF_HEAD_PROMPT, { base64: image.base64, mimeType: image.mimeType });
      if (isPlausible(out)) {
        if (usesDevKey) await incrementUsage(env, account.email, now);
        return json({ image: { base64: out.imageBase64, mimeType: out.mimeType } });
      }
    }
    return errorResponse("generation_failed", "Could not produce a valid image.", 502);
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse("gemini_error", err.message, err.status === 429 ? 429 : 502);
    return errorResponse("internal_error", "Unexpected error.", 500);
  }
}
```

- [ ] **Step 4: Route adapter** `functions/api/generate.ts`

```ts
import type { Env } from "../../shared/env";
import { handleGenerate } from "../../shared/handlers/generate";
import { createGeminiClient } from "../../shared/gemini";
export const onRequestPost = (ctx: { request: Request; env: Env }) =>
  handleGenerate(ctx.request, ctx.env, { makeClient: (apiKey) => createGeminiClient(apiKey) });
```

- [ ] **Step 5: Delete the Phase 1 body-key handler.** `git rm functions/src/generate.ts functions/src/generate.test.ts` (its logic now lives in `shared/handlers/generate.ts`). Confirm nothing else imports it first.

- [ ] **Step 6:** `npm test` + `npm run typecheck` + `npm --prefix functions run typecheck` all clean. Commit `feat(hosted): authenticated generate with own-key/dev-key selection + caps`.

---

## Self-Review

- **Spec coverage:** §4.4 key view/edit gated by email code -> Tasks 1-2; §10 `/api/key/*` -> Task 2; §10 `/api/dev/allowlist` (dev-owner) -> Task 3; §3.4 key selection + §7 caps + §6 hardened generation -> Task 4; the `typ:"key-edit"` vs `typ:"session"` separation (Plan 02 carry-forward) -> Task 1, enforced by both verifiers. The client is Plan 04.
- **Placeholder scan:** none. `DEV_ACCOUNT_ID` is a real constant matching migration 0002.
- **Type consistency:** `getAuthedAccount` returns `Account | null`; `requireDevOwner` returns `Account | Response`; `handleGenerate` deps `{ makeClient }` matches the Phase 1 shape reused by the route adapter; `overCap(usage, account.isDev)` matches the Plan 01 signature; codes for keys use purpose `"key"` in both `issueCode` and `verifyStoredCode`.
- **Security:** key decrypted only for its own owner (reveal, after a fresh code) or server-side for Gemini (generate); never logged, never returned by generate; key writes require a fresh `typ:"key-edit"` token bound to the caller's own account id; allowlist admin is dev-only; caps enforced before spend and incremented only after success.
- **Carry-forwards honored:** codes keyed by `account.email` (Task 2); dev key fetched by the seeded id; the reusable `getAuthedAccount` gate used by every handler.
