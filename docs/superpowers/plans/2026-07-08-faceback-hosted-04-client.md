# FaceBack Hosted - Plan 04: Client Rewrite and Deploy Runbook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the React client to talk to the hosted backend - passwordless email-code sign-in, server-side keys, session-based generation - remove all on-device crypto/PIN, and deliver a local end-to-end harness (`wrangler pages dev`) plus the exact deploy runbook.

**Architecture:** A single same-origin API client (`web/src/units/apiClient.ts`) wraps every `/api/*` call with `credentials: "include"` (the HttpOnly session cookie). Screens call it; there is no client-side key encryption. The app shell resolves auth state from `GET /api/me` and routes: signed-out -> SignIn; signed-in with no usable key -> AddKey onboarding; otherwise the camera app. The camera/collection/export/face-gate/imageUtil units are unchanged; the collection stays local (IndexedDB). A small session-gated `POST /api/key` is added to the backend so first-key onboarding is one step.

**Tech Stack:** React 18, Vite, TypeScript, Vitest + React Testing Library, Cloudflare Pages Functions, Wrangler (`wrangler pages dev`), Resend.

## Global Constraints

- Every `/api/*` call is same-origin and sends `credentials: "include"` (the session cookie). No `Authorization` header is needed in the browser; the cookie carries the session.
- `GET /api/me` returns `{ username, email, hasOwnKey, isDev, usesDevKey }` or 401 when signed out. This is the single source of auth state. `usesDevKey` true means the user generates on the shared dev key (a friend or the owner) and must NOT be shown the add-your-own-key UI.
- Sign-in is passwordless: signup takes username + email; sign-in takes one identifier field; both then take a 6-digit code. There is NO PIN and NO client-side key crypto anywhere. Delete the on-device keystore/PIN/recovery code.
- Key handling: a first key (when `hasOwnKey` is false and `usesDevKey` is false) is saved with `POST /api/key { apiKey }` (session only). Viewing or changing an existing key uses `POST /api/key/challenge` -> enter emailed code -> `POST /api/key/reveal { code }` (returns `{ apiKey, editToken }`) -> `PUT /api/key { apiKey, editToken }`.
- Generation calls `POST /api/generate { image: { base64, mimeType } }` with the session; it sends NO key. The client maps error codes: `daily_limit` (429) -> "Daily limit reached. Try again tomorrow."; `no_key` (400) -> route to AddKey; `unauthorized` (401) -> sign out.
- The client keeps its input face-gate (cost-saver) and the collection (local). The daily-cap client throttle is superseded by the server; keep only the min-interval courtesy throttle.
- Branding unchanged: FaceBack wordmark only, the existing skin (`theme.css`), SF-style icons, no emoji, Result header verbatim "It's just the back of their head." No em dash characters anywhere (use a hyphen).
- The dev owner (`isDev` true) sees an allowlist editor in Settings; normal users and friends do not.

## File Structure

- `shared/handlers/key/setInitial.ts` (create) + `functions/api/key/index.ts` (modify: add `onRequestPost`) - the session-gated first-key endpoint.
- `web/src/units/apiClient.ts` (create) - `authApi`, `keyApi`, `allowlistApi`, `meApi`, shared `ApiError`, `PublicAccount` type.
- `web/src/units/generationClient.ts` (modify) - drop `apiKey`, add `credentials: "include"`.
- `web/src/ui/flow.ts` (modify) - drop `apiKey` from `runGeneration` input and `GenerationDeps.generate`.
- `web/src/ui/screens/SignIn.tsx` (rewrite) + `web/src/ui/screens/AddKey.tsx` (create) + `web/src/ui/screens/Settings.tsx` (rewrite).
- `web/src/App.tsx` (rewrite the shell/routing).
- `web/src/units/config.ts` (modify: drop the now-unused DAILY_CAP/PBKDF2 constants if unused after cleanup).
- Delete: `web/src/units/auth.ts`, `web/src/units/keystore.ts`, `web/src/units/indexeddb.ts`, `web/src/units/recovery.ts` and their tests (`auth.test.ts`, `keystore.key.test.ts`, `keystore.pin.test.ts`, `indexeddb.test.ts`, `recovery.test.ts`); `web/src/ui/components/PinInput.tsx` is repurposed as the code input or deleted if a dedicated code field is added.
- `wrangler.toml` (modify if needed) + a `README`/runbook section - local `wrangler pages dev` and the deploy runbook.
- `docs/superpowers/DEPLOY.md` (create) - the provisioning + deploy runbook.

## Global note for implementers

The existing Phase 1 screens (`Camera.tsx`, `Result.tsx`, `Collection.tsx`) and the components (`Wordmark`, `Button`, `TextField`, `PinInput`) plus `theme.css` are the visual reference. Match their skin, spacing, and idiom exactly. Tests use React Testing Library + `@testing-library/jest-dom` (already configured). Mock the API by injecting a `fetch` stub or by mocking `apiClient` functions - do not hit the network. Run `cd web && npm test`, and typecheck via `cd web && npx tsc -b --noEmit` (or the existing `npm run build`'s tsc step); the root `npm test`/`npm run typecheck` cover the backend.

---

### Task 1: Backend session-gated first-key endpoint

**Files:** Create `shared/handlers/key/setInitial.ts`, `shared/handlers/key/setInitial.test.ts`. Modify `functions/api/key/index.ts` (add `onRequestPost`).
**Interfaces produced:** `handleSetInitialKey(req, env)` - session-gated; if the account has NO key, encrypt + store the posted `apiKey` and 200; if a key already exists, 409 `key_exists` (directing the user to the code-gated edit); empty apiKey 400; anonymous 401.

- [ ] **Step 1: Failing test** (real D1/KV, `env` from `cloudflare:workers`): a signed-in account with no key POSTs `{ apiKey }` -> 200 and `getAccountKeyCipher` now returns a cipher that decrypts to the key; a second POST -> 409 `key_exists` (the first key is unchanged); anonymous -> 401; empty apiKey -> 400.

- [ ] **Step 2: Implement `shared/handlers/key/setInitial.ts`**

```ts
import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { getAuthedAccount } from "../../auth/requestAuth";
import { getAccountKeyCipher, setAccountKey } from "../../data/accounts";
import { encryptApiKey } from "../../crypto/keyCipher";

export async function handleSetInitialKey(req: Request, env: Env): Promise<Response> {
  const account = await getAuthedAccount(req, env);
  if (!account) return errorResponse("unauthorized", "Sign in required.", 401);
  const body = (await req.json().catch(() => null)) as { apiKey?: unknown } | null;
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) return errorResponse("bad_input", "An API key is required.", 400);
  if (await getAccountKeyCipher(env, account.id))
    return errorResponse("key_exists", "A key is already set. Use edit instead.", 409);
  const { ciphertext, iv } = await encryptApiKey(apiKey, env.KEY_ENC_SECRET);
  await setAccountKey(env, account.id, ciphertext, iv);
  return json({ ok: true });
}
```

- [ ] **Step 3: Wire the adapter.** In `functions/api/key/index.ts` add `export const onRequestPost = (ctx) => handleSetInitialKey(ctx.request, ctx.env);` alongside the existing `onRequestPut`.

- [ ] **Step 4:** `npm test` + `npm run typecheck` + `npm --prefix functions run typecheck` clean. Commit `feat(hosted): session-gated first-key POST /api/key`.

---

### Task 2: Client API layer

**Files:** Create `web/src/units/apiClient.ts`, `web/src/units/apiClient.test.ts`. Modify `web/src/units/generationClient.ts`, `web/src/ui/flow.ts` (+ update `flow.test.ts`, `generationClient.test.ts`).
**Interfaces produced:** a `PublicAccount` type; `ApiError { code, message }`; `meApi.get()`; `authApi.signup/request/verify/logout`; `keyApi.setInitial/challenge/reveal/edit`; `allowlistApi.list/add/remove`. Each wraps `fetch(url, { credentials: "include", ... })` and throws `ApiError` on non-ok using the `{ error: { code, message } }` envelope.

- [ ] **Step 1: Failing test** - inject a `fetch` stub. Assert: `meApi.get()` returns the parsed account on 200 and `null` on 401; `authApi.verify` returns `{ account }`; a 429 `daily_limit` from `generateBackOfHead` throws `GenerationRequestError` with `.code === "daily_limit"`; every call includes `credentials: "include"`; no call sends an `apiKey`/`key` field.

- [ ] **Step 2: Implement `web/src/units/apiClient.ts`** (all calls same-origin `/api`, `credentials: "include"`, JSON). Example shape:

```ts
import { config } from "./config";

export interface PublicAccount {
  username: string; email: string; hasOwnKey: boolean; isDev: boolean; usesDevKey: boolean;
}
export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = "ApiError"; this.code = code; }
}

async function call<T>(path: string, init: RequestInit, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${config.FUNCTIONS_BASE_URL}${path}`, {
    ...init, credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error?.code ?? "request_failed", data?.error?.message ?? `Request failed (${res.status})`);
  return data as T;
}

export const meApi = {
  async get(fetchImpl?: typeof fetch): Promise<PublicAccount | null> {
    try { return await call<PublicAccount>("/me", { method: "GET" }, fetchImpl); }
    catch (e) { if (e instanceof ApiError && e.message.includes("401")) return null; if (e instanceof ApiError) return null; throw e; }
  },
};
// authApi.signup({username,email}) -> POST /auth/signup ; request({identifier}) -> POST /auth/request ;
// verify({identifier,code}) -> POST /auth/verify ; logout() -> POST /auth/logout
// keyApi.setInitial({apiKey}) -> POST /key ; challenge() -> POST /key/challenge ;
// reveal({code}) -> POST /key/reveal ; edit({apiKey,editToken}) -> PUT /key
// allowlistApi.list() -> GET /dev/allowlist ; add(email) -> POST ; remove(email) -> DELETE /dev/allowlist
```
(Implement each named method with the right verb/path/body. `meApi.get` must return null on a 401, not throw.)

- [ ] **Step 3:** Modify `generationClient.ts`: remove `apiKey` from the params type and the body; send `credentials: "include"`; keep throwing `GenerationRequestError` with the server code. Modify `flow.ts`: `runGeneration` input becomes `{ blob }`, and `GenerationDeps.generate` becomes `(input: { image }) => Promise<{ base64, mimeType }>`. Update `flow.test.ts` and `generationClient.test.ts` accordingly.

- [ ] **Step 4:** `cd web && npm test` + typecheck clean. Commit `feat(web): same-origin API client, session-based generate`.

---

### Task 3: SignIn rewrite (email-code)

**Files:** Rewrite `web/src/ui/screens/SignIn.tsx`, `web/src/ui/screens/SignIn.test.tsx`.
**Behavior:** Two modes. Sign in: one field (username or email) -> "Send code" (`authApi.request`) -> 6-digit code field -> "Verify" (`authApi.verify`) -> on success call `onSignedIn(account)`. Create account: a link toggles to username + email -> "Send code" (`authApi.signup`) -> code field -> verify. A `no_account` error on sign-in offers "Create an account". Reuse the FaceBack skin, `Wordmark`, `TextField`, and the code input (repurpose `PinInput` for 6 digits or a plain text field). No PIN, no key field.

- [ ] **Step 1:** RTL test: entering an email + Send code calls `authApi.request` (mocked) with that identifier; entering the code + Verify calls `authApi.verify` and fires `onSignedIn` with the returned account; the create-account toggle shows username + email and calls `authApi.signup`. Assert no PIN/key inputs exist.
- [ ] **Step 2:** Implement, matching the existing SignIn skin. Commit `feat(web): email-code sign-in screen`.

---

### Task 4: App shell + AddKey onboarding + generate flow

**Files:** Rewrite `web/src/App.tsx`; create `web/src/ui/screens/AddKey.tsx`, `web/src/ui/screens/AddKey.test.tsx`; update `web/src/App.test.tsx` if present.
**Behavior:** On mount, `meApi.get()`. While loading, a spinner. If null -> `<SignIn onSignedIn={setAccount}/>`. If account and `!hasOwnKey && !usesDevKey` -> `<AddKey onDone={refreshMe}/>` (calls `keyApi.setInitial`). Otherwise the camera app. `handleCapture` calls `runGeneration({ blob }, deps)` where `deps.generate` is the session-based `generateBackOfHead`; map errors: `daily_limit` -> the daily-limit message, `no_key` -> route to AddKey, `unauthorized` -> `setAccount(null)`. Settings and Collection wired as before; collection stays local. Keep the object-URL revocation and the 100dvh layout from Phase 1.

- [ ] **Step 1:** RTL: mocked `meApi.get` returning null renders SignIn; returning `{hasOwnKey:false, usesDevKey:false}` renders AddKey; returning `{usesDevKey:true}` renders the camera app (no AddKey). A generate call that throws `daily_limit` shows the limit message; one that throws `no_key` routes to AddKey. AddKey test: entering a key + Save calls `keyApi.setInitial` and then `onDone`.
- [ ] **Step 2:** Implement. Commit `feat(web): session-based app shell + AddKey onboarding`.

---

### Task 5: Settings rewrite (email-code key management + allowlist)

**Files:** Rewrite `web/src/ui/screens/Settings.tsx`, `web/src/ui/screens/Settings.test.tsx`.
**Behavior:** Show `@username` and email. Sign out -> `authApi.logout()` then `onSignedOut()`. If the account is NOT `usesDevKey` (i.e. a normal own-key user), a "View / edit API key" row: tapping it calls `keyApi.challenge()`, shows a code field; entering the code calls `keyApi.reveal({code})` -> shows the decrypted key in an editable field + a Save that calls `keyApi.edit({apiKey, editToken})`. If `usesDevKey`, show "Using the shared FaceBack key" instead (no key controls). If `isDev`, show an allowlist editor: `allowlistApi.list()` on open, an add-email field (`allowlistApi.add`), and a remove control per entry (`allowlistApi.remove`). No PIN anywhere.

- [ ] **Step 1:** RTL: for an own-key user, the reveal flow calls challenge -> reveal -> edit (mocked) in order and Save calls `keyApi.edit` with the editToken; for a `usesDevKey` user, no key field renders; for an `isDev` user, the allowlist list renders and add/remove call the API; Sign out calls `authApi.logout` then `onSignedOut`.
- [ ] **Step 2:** Implement, matching the existing Settings skin (rows, modal). Commit `feat(web): settings - email-code key management + dev allowlist`.

---

### Task 6: Remove on-device crypto, local dev harness, deploy runbook

**Files:** Delete `web/src/units/{auth,keystore,indexeddb,recovery}.ts` and their tests, and `web/src/units/keystore.key.test.ts`/`keystore.pin.test.ts`; remove `PinInput` if unused. Prune now-unused constants from `config.ts`. Create `docs/superpowers/DEPLOY.md`. Verify `wrangler pages dev` serves the app + functions locally.

- [ ] **Step 1:** Delete the dead modules + tests; fix any imports (grep for `units/auth`, `units/keystore`, `units/indexeddb`, `units/recovery`, `revealApiKey`, `verifyAccountPin`). `cd web && npm test` and the web build's tsc must be clean, and root `npm test` + both typechecks clean.
- [ ] **Step 2:** Confirm `wrangler pages dev` runs the static build + the `functions/api/**` routes against local D1/KV with the migrations applied (document the exact command and any `--d1`/`--kv` flags in DEPLOY.md). This is the local end-to-end path (secure context on `localhost`, so no Web Crypto issue).
- [ ] **Step 3: Write `docs/superpowers/DEPLOY.md`** - the owner runbook: (1) `wrangler d1 create faceback` + `wrangler kv namespace create faceback-kv`, paste the ids into `wrangler.toml`; (2) apply migrations to remote D1; (3) create the Pages project, set the build output to `web/dist`; (4) set secrets `SESSION_SECRET`, `KEY_ENC_SECRET`, `RESEND_API_KEY` (with generated strong values); (5) Resend: add `acb-apps.com`, add the DKIM/SPF records at Squarespace; (6) Squarespace: add the `faceback` CNAME to `<project>.pages.dev`, attach the custom domain in Pages; (7) sign in as `dev`/`alexanderbecquet0@gmail.com`, add the Gemini key (first-key POST), add friends' emails. Include the known limitation (non-atomic KV counters -> marginal cap overspill under bursts; Durable Object is the strict-enforcement upgrade).
- [ ] **Step 4:** Commit `chore(web): remove on-device crypto; add local harness + deploy runbook`.

---

## Self-Review

- **Spec coverage:** §11 client changes -> Tasks 2-6; §4.4 key view/edit -> Task 5; onboarding first-key (§11) -> Task 1 + Task 4 AddKey; §3.4 friend-vs-own routing via `usesDevKey` -> Task 4/5; §10 client consumes the full API -> Task 2; §12 local dev + §13 provisioning -> Task 6. The face-gate and collection stay local (spec §11, §6).
- **Placeholder scan:** the API client method list in Task 2 names each verb/path/body; the implementer fills the bodies. No TBDs.
- **Type consistency:** `PublicAccount` matches the server's `accountSummary` (`hasOwnKey`, not `hasKey`); `runGeneration` and `GenerationDeps.generate` both drop `apiKey`; error codes (`daily_limit`, `no_key`, `unauthorized`, `key_exists`, `bad_code`, `rate_limited`) match the handlers.
- **Deviation flagged:** the session-gated `POST /api/key` first-key endpoint (Task 1) is an addition beyond the spec's §10 API list, chosen for smooth onboarding (aligns with §11); editing an existing key stays code-gated per §4.4. Surface this in the handoff for owner sign-off.
- **Not verifiable here:** live camera + real generation + pixel-level visuals need the owner's device and a deploy; this plan makes the app buildable, unit/RTL-tested, and locally E2E-runnable via `wrangler pages dev`.
