# FaceBack Hosted - Plan 02: Auth and Email Handlers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the passwordless email-code authentication surface on top of the Plan 01 primitives: a Resend email provider, KV rate limiting, a KV-backed code lifecycle, and the signup / request / verify / logout / me handlers with their Cloudflare route adapters.

**Architecture:** Framework-agnostic handlers in `shared/handlers/` compose the Plan 01 units (accounts DAL, codes, session, allowlist) with three new units (email provider, rate limiter, code store). Thin `functions/api/**` adapters construct dependencies from `env` and delegate. Handlers take an injected `EmailProvider` so tests use a recording provider and never hit the network. The single dev account is reserved by a seed migration so open signup cannot squat it.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, D1, KV, Resend (HTTP API via `fetch`), Vitest with `@cloudflare/vitest-pool-workers`.

## Global Constraints

- Passwordless only. Codes are 6 digits, 10-minute TTL, single use, max 5 verification attempts then burned (enforced by the code store over the Plan 01 `codes.ts` primitives). No PIN, no password.
- Rate limit the code-issuing endpoints (`/auth/signup`, `/auth/request`) per email/identifier and per client IP: 5 per hour per email, 20 per hour per IP. Client IP is the `CF-Connecting-IP` request header.
- Sender address is `faceback@acb-apps.com` (a single exported constant).
- Signup validation: username is non-empty and contains NO `@`; email is non-empty and contains `@`. The dev identity (`username = "dev"`, `email = "alexanderbecquet0@gmail.com"`, `is_dev = 1`) is seeded by a migration and thereby reserved. An existing but UNVERIFIED account re-issues a fresh code instead of erroring; a VERIFIED collision returns a generic "already registered / taken".
- Sessions: issued only by `verify`, using Plan 01 `signSession` (which stamps `typ: "session"`). Set an `HttpOnly; Secure; SameSite=Lax` cookie AND return the token in the body for native clients. `verifySession` is the only accepted session check.
- No auth handler ever returns, logs, or accepts an API key. Error envelope is `{ error: { code, message } }` (Plan 01 `shared/http.ts`).
- `me` returns exactly `{ username, email, hasKey, isDev, usesDevKey }`, where `usesDevKey = isDev || isAllowlisted(email)`.
- Do not reveal code-vs-account distinctions on verify failure (generic "invalid or expired code").
- No em dash characters, no emoji. Reuse Plan 01 units; do not reimplement hashing, session, or DAL logic.

## File Structure

- `shared/email.ts` (create; supersedes the dead `functions/src/lib/email.ts`) - `EmailProvider`, `createResendProvider`, `createRecordingProvider`, `FROM_ADDRESS`.
- `shared/data/ratelimit.ts` (create) - fixed-window KV rate limiter.
- `shared/auth/codeStore.ts` (create) - KV-backed issue/verify code lifecycle over `shared/crypto/codes.ts`.
- `shared/auth/requestAuth.ts` (create) - `getSessionToken(req)`, `accountSummary(env, account)`, `PublicAccount`.
- `shared/handlers/auth/validate.ts` (create) - `validateSignup`, `validateIdentifier`.
- `shared/handlers/auth/signup.ts`, `request.ts`, `verify.ts`, `logout.ts` (create).
- `shared/handlers/me.ts` (create).
- `migrations/0002_seed_dev.sql` (create) - reserve/seed the dev account.
- `functions/api/auth/signup.ts`, `request.ts`, `verify.ts`, `logout.ts` (create) - route adapters.
- `functions/api/me.ts` (create) - route adapter.
- Delete `functions/src/lib/email.ts` and `functions/src/lib/email.test.ts` (superseded by `shared/email.ts`).

---

### Task 1: Email provider

**Files:** Create `shared/email.ts`, `shared/email.test.ts`. Delete `functions/src/lib/email.ts`, `functions/src/lib/email.test.ts` (confirm nothing imports them first - `recovery.ts` which used them was already deleted in Plan 01).

**Interfaces produced:** `interface CodeEmail { to: string; code: string; purpose: "auth" | "key" }`; `interface EmailProvider { sendCode(email: CodeEmail): Promise<void> }`; `createResendProvider(apiKey: string, from: string): EmailProvider`; `createRecordingProvider(): EmailProvider & { sent: CodeEmail[] }`; `const FROM_ADDRESS = "faceback@acb-apps.com"`.

- [ ] **Step 1: Failing test** (`shared/email.test.ts`)

```ts
import { afterEach, expect, test, vi } from "vitest";
import { createRecordingProvider, createResendProvider } from "./email";

afterEach(() => vi.restoreAllMocks());

test("recording provider captures sent codes", async () => {
  const p = createRecordingProvider();
  await p.sendCode({ to: "a@example.com", code: "123456", purpose: "auth" });
  expect(p.sent).toEqual([{ to: "a@example.com", code: "123456", purpose: "auth" }]);
});

test("resend provider posts to the Resend API with auth + recipient", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "e1" }), { status: 200 }),
  );
  const p = createResendProvider("re_test_key", "faceback@acb-apps.com");
  await p.sendCode({ to: "b@example.com", code: "654321", purpose: "auth" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect((init!.headers as Record<string, string>)["Authorization"]).toBe("Bearer re_test_key");
  const body = JSON.parse(init!.body as string);
  expect(body.from).toBe("faceback@acb-apps.com");
  expect(body.to).toBe("b@example.com");
  expect(body.text).toContain("654321");
});

test("resend provider throws on non-ok response", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 422 }));
  const p = createResendProvider("k", "f@acb-apps.com");
  await expect(p.sendCode({ to: "c@example.com", code: "000000", purpose: "auth" })).rejects.toThrow();
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run shared/email.test.ts` -> FAIL (module missing).

- [ ] **Step 3: Implement `shared/email.ts`**

```ts
export const FROM_ADDRESS = "faceback@acb-apps.com";

export interface CodeEmail {
  to: string;
  code: string;
  purpose: "auth" | "key";
}

export interface EmailProvider {
  sendCode(email: CodeEmail): Promise<void>;
}

function subjectFor(purpose: CodeEmail["purpose"]): string {
  return purpose === "key" ? "Your FaceBack key access code" : "Your FaceBack sign-in code";
}

function bodyFor(code: string): string {
  return `Your FaceBack code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`;
}

export function createResendProvider(apiKey: string, from: string): EmailProvider {
  return {
    async sendCode({ to, code, purpose }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject: subjectFor(purpose), text: bodyFor(code) }),
      });
      if (!res.ok) throw new Error(`Resend send failed: ${res.status}`);
    },
  };
}

export function createRecordingProvider(): EmailProvider & { sent: CodeEmail[] } {
  const sent: CodeEmail[] = [];
  return {
    sent,
    async sendCode(email) {
      sent.push(email);
    },
  };
}
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run shared/email.test.ts` -> PASS.
- [ ] **Step 5: Delete the dead Phase 1 email module.** `git rm functions/src/lib/email.ts functions/src/lib/email.test.ts`. Run `npm test` and `npm run typecheck` and `npm --prefix functions run typecheck` - all clean.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(hosted): Resend email provider (+ recording provider for tests)"`

---

### Task 2: Fixed-window KV rate limiter

**Files:** Create `shared/data/ratelimit.ts`, `shared/data/ratelimit.test.ts`.

**Interfaces produced:** `checkRateLimit(env: Env, scope: string, key: string, limit: number, windowSeconds: number, nowMs: number): Promise<boolean>` - returns `true` if the call is allowed (and records it), `false` if the limit for the current window is already reached.

- [ ] **Step 1: Failing test** (`shared/data/ratelimit.test.ts`)

```ts
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { checkRateLimit } from "./ratelimit";

const NOW = 1_800_000_000_000;

test("allows up to the limit, then blocks, within a window", async () => {
  const results: boolean[] = [];
  for (let i = 0; i < 4; i++) results.push(await checkRateLimit(env, "email", "x@example.com", 3, 3600, NOW));
  expect(results).toEqual([true, true, true, false]);
});

test("resets in the next window", async () => {
  await checkRateLimit(env, "ip", "1.2.3.4", 1, 3600, NOW);
  expect(await checkRateLimit(env, "ip", "1.2.3.4", 1, 3600, NOW)).toBe(false);
  expect(await checkRateLimit(env, "ip", "1.2.3.4", 1, 3600, NOW + 3600 * 1000)).toBe(true);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `shared/data/ratelimit.ts`**

```ts
import type { Env } from "../env";

export async function checkRateLimit(
  env: Env,
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
  nowMs: number,
): Promise<boolean> {
  const bucket = Math.floor(nowMs / 1000 / windowSeconds);
  const k = `rl:${scope}:${key}:${bucket}`;
  const current = parseInt((await env.KV.get(k)) ?? "0", 10) || 0;
  if (current >= limit) return false;
  await env.KV.put(k, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return true;
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git add shared/data/ratelimit.ts shared/data/ratelimit.test.ts && git commit -m "feat(hosted): fixed-window KV rate limiter"`

---

### Task 3: KV-backed code store

**Files:** Create `shared/auth/codeStore.ts`, `shared/auth/codeStore.test.ts`.

**Interfaces produced:** `issueCode(env: Env, purpose: "auth" | "key", identifier: string): Promise<string>` (generates, hashes, stores with 10-min TTL, returns the plaintext code to email); `verifyStoredCode(env: Env, purpose: "auth" | "key", identifier: string, code: string): Promise<boolean>` (max 5 attempts, burns on success or on reaching the attempt cap).

- [ ] **Step 1: Failing test** (`shared/auth/codeStore.test.ts`)

```ts
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { issueCode, verifyStoredCode } from "./codeStore";

test("issue then verify the correct code succeeds once and burns it", async () => {
  const code = await issueCode(env, "auth", "u@example.com");
  expect(code).toMatch(/^\d{6}$/);
  expect(await verifyStoredCode(env, "auth", "u@example.com", code)).toBe(true);
  // burned: a second verify of the same code fails
  expect(await verifyStoredCode(env, "auth", "u@example.com", code)).toBe(false);
});

test("a wrong code fails, and after 5 attempts the code is burned", async () => {
  const code = await issueCode(env, "auth", "v@example.com");
  for (let i = 0; i < 5; i++) expect(await verifyStoredCode(env, "auth", "v@example.com", "000001")).toBe(false);
  // even the correct code no longer works after the attempt cap
  expect(await verifyStoredCode(env, "auth", "v@example.com", code)).toBe(false);
});

test("verifying with no issued code fails", async () => {
  expect(await verifyStoredCode(env, "auth", "absent@example.com", "123456")).toBe(false);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `shared/auth/codeStore.ts`**

```ts
import type { Env } from "../env";
import { generateCode, hashCode, verifyCode } from "../crypto/codes";

const TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

interface CodeRecord {
  hash: string;
  salt: string;
  attempts: number;
}

function keyFor(purpose: string, identifier: string): string {
  return `code:${purpose}:${identifier.trim().toLowerCase()}`;
}

export async function issueCode(env: Env, purpose: "auth" | "key", identifier: string): Promise<string> {
  const code = generateCode();
  const { hash, salt } = await hashCode(code);
  const rec: CodeRecord = { hash, salt, attempts: 0 };
  await env.KV.put(keyFor(purpose, identifier), JSON.stringify(rec), { expirationTtl: TTL_SECONDS });
  return code;
}

export async function verifyStoredCode(
  env: Env,
  purpose: "auth" | "key",
  identifier: string,
  code: string,
): Promise<boolean> {
  const k = keyFor(purpose, identifier);
  const raw = await env.KV.get(k);
  if (!raw) return false;
  const rec = JSON.parse(raw) as CodeRecord;
  if (rec.attempts >= MAX_ATTEMPTS) {
    await env.KV.delete(k);
    return false;
  }
  if (await verifyCode(code, rec.hash, rec.salt)) {
    await env.KV.delete(k);
    return true;
  }
  rec.attempts += 1;
  if (rec.attempts >= MAX_ATTEMPTS) await env.KV.delete(k);
  else await env.KV.put(k, JSON.stringify(rec), { expirationTtl: TTL_SECONDS });
  return false;
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git add shared/auth/codeStore.ts shared/auth/codeStore.test.ts && git commit -m "feat(hosted): KV-backed code store (10-min TTL, max 5 attempts)"`

---

### Task 4: Dev-account seed, validation, and the signup + request handlers

**Files:** Create `migrations/0002_seed_dev.sql`, `shared/handlers/auth/validate.ts`, `shared/handlers/auth/signup.ts`, `shared/handlers/auth/request.ts`, `functions/api/auth/signup.ts`, `functions/api/auth/request.ts`. Tests: `shared/handlers/auth/signup.test.ts`, `shared/handlers/auth/request.test.ts`, `shared/handlers/auth/validate.test.ts`.

**Interfaces consumed:** `createAccount`, `getAccountByIdentifier`, `DuplicateAccountError` (accounts.ts); `checkRateLimit` (ratelimit.ts); `issueCode` (codeStore.ts); `EmailProvider`, `FROM_ADDRESS`, `createResendProvider` (email.ts); `json`, `errorResponse` (http.ts).
**Interfaces produced:** `validateSignup(input): { username: string; email: string } | { error: string }`; `validateIdentifier(input): string | null`; `handleSignup(req, env, email)`; `handleRequest(req, env, email)`.

- [ ] **Step 1: Seed migration** `migrations/0002_seed_dev.sql`

```sql
INSERT OR IGNORE INTO accounts (id, username, email, email_verified, is_dev, created_at)
VALUES ('acc_dev', 'dev', 'alexanderbecquet0@gmail.com', 0, 1, '2026-07-08T00:00:00.000Z');
```

- [ ] **Step 2: Validation test + impl** (`shared/handlers/auth/validate.test.ts`, then `validate.ts`)

```ts
import { expect, test } from "vitest";
import { validateSignup, validateIdentifier } from "./validate";

test("valid signup normalizes and passes", () => {
  expect(validateSignup({ username: " Alice ", email: "Alice@Example.com" }))
    .toEqual({ username: "alice", email: "alice@example.com" });
});
test("username with @ or empty is rejected", () => {
  expect("error" in validateSignup({ username: "a@b", email: "x@y.com" })).toBe(true);
  expect("error" in validateSignup({ username: "", email: "x@y.com" })).toBe(true);
});
test("bad email is rejected", () => {
  expect("error" in validateSignup({ username: "ok", email: "no-at-sign" })).toBe(true);
});
test("validateIdentifier trims/lowercases or returns null", () => {
  expect(validateIdentifier({ identifier: " Bob " })).toBe("bob");
  expect(validateIdentifier({ identifier: "" })).toBeNull();
  expect(validateIdentifier({ identifier: 5 })).toBeNull();
});
```

```ts
// validate.ts
export function validateSignup(input: unknown): { username: string; email: string } | { error: string } {
  const o = (input ?? {}) as Record<string, unknown>;
  const username = typeof o.username === "string" ? o.username.trim().toLowerCase() : "";
  const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
  if (!username || username.includes("@")) return { error: "Username is required and cannot contain @." };
  if (!email || !email.includes("@")) return { error: "A valid email is required." };
  return { username, email };
}

export function validateIdentifier(input: unknown): string | null {
  const o = (input ?? {}) as Record<string, unknown>;
  if (typeof o.identifier !== "string") return null;
  const id = o.identifier.trim().toLowerCase();
  return id === "" ? null : id;
}
```

- [ ] **Step 3: Signup handler test** (`shared/handlers/auth/signup.test.ts`)

```ts
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleSignup } from "./signup";
import { createRecordingProvider } from "../../email";
import { getAccountByIdentifier } from "../../data/accounts";

function req(body: unknown, ip = "9.9.9.9"): Request {
  return new Request("http://x/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
}

test("new signup creates an unverified account and emails a code", async () => {
  const email = createRecordingProvider();
  const res = await handleSignup(req({ username: "newby", email: "newby@example.com" }), env, email);
  expect(res.status).toBe(200);
  expect(email.sent).toHaveLength(1);
  expect(email.sent[0].to).toBe("newby@example.com");
  expect(email.sent[0].code).toMatch(/^\d{6}$/);
  const acc = await getAccountByIdentifier(env, "newby@example.com");
  expect(acc?.emailVerified).toBe(false);
});

test("invalid username (contains @) is a 400 and sends no email", async () => {
  const email = createRecordingProvider();
  const res = await handleSignup(req({ username: "a@b", email: "z@example.com" }), env, email);
  expect(res.status).toBe(400);
  expect(email.sent).toHaveLength(0);
});

test("taken username with a different email is rejected", async () => {
  const email = createRecordingProvider();
  await handleSignup(req({ username: "dupe", email: "first@example.com" }), env, email);
  const res = await handleSignup(req({ username: "dupe", email: "second@example.com" }), env, email);
  expect(res.status).toBe(409);
});
```

- [ ] **Step 4: Run, verify fail; implement `shared/handlers/auth/signup.ts`**

```ts
import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { validateSignup } from "./validate";
import { checkRateLimit } from "../../data/ratelimit";
import { createAccount, getAccountByIdentifier, DuplicateAccountError } from "../../data/accounts";
import { issueCode } from "../../auth/codeStore";
import type { EmailProvider } from "../../email";

export async function handleSignup(req: Request, env: Env, email: EmailProvider): Promise<Response> {
  const parsed = validateSignup(await req.json().catch(() => null));
  if ("error" in parsed) return errorResponse(400, "bad_input", parsed.error);
  const now = Date.now();
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await checkRateLimit(env, "email", parsed.email, 5, 3600, now)))
    return errorResponse(429, "rate_limited", "Too many attempts. Try again later.");
  if (!(await checkRateLimit(env, "ip", ip, 20, 3600, now)))
    return errorResponse(429, "rate_limited", "Too many attempts. Try again later.");

  const byEmail = await getAccountByIdentifier(env, parsed.email);
  if (byEmail) {
    if (byEmail.emailVerified)
      return errorResponse(409, "account_exists", "That email is already registered. Sign in instead.");
    const code = await issueCode(env, "auth", byEmail.email);
    await email.sendCode({ to: byEmail.email, code, purpose: "auth" });
    return json({ pending: true });
  }
  if (await getAccountByIdentifier(env, parsed.username))
    return errorResponse(409, "username_taken", "That username is taken.");

  let account;
  try {
    account = await createAccount(env, { username: parsed.username, email: parsed.email });
  } catch (e) {
    if (e instanceof DuplicateAccountError)
      return errorResponse(409, "account_exists", "That username or email is taken.");
    throw e;
  }
  const code = await issueCode(env, "auth", account.email);
  await email.sendCode({ to: account.email, code, purpose: "auth" });
  return json({ pending: true });
}
```

- [ ] **Step 5: Request handler test + impl** (`shared/handlers/auth/request.test.ts`, then `request.ts`)

```ts
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleRequest } from "./request";
import { createRecordingProvider } from "../../email";
import { createAccount } from "../../data/accounts";

function req(identifier: unknown): Request {
  return new Request("http://x/api/auth/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "8.8.8.8" },
    body: JSON.stringify({ identifier }),
  });
}

test("existing account gets a code by email (looked up by username or email)", async () => {
  await createAccount(env, { username: "signin", email: "signin@example.com" });
  const email = createRecordingProvider();
  const res = await handleRequest(req("signin"), env, email);
  expect(res.status).toBe(200);
  expect(email.sent[0].to).toBe("signin@example.com");
});

test("unknown identifier returns 404 no_account and sends nothing", async () => {
  const email = createRecordingProvider();
  const res = await handleRequest(req("ghost"), env, email);
  expect(res.status).toBe(404);
  expect(email.sent).toHaveLength(0);
});
```

```ts
// request.ts
import type { Env } from "../../env";
import { json, errorResponse } from "../../http";
import { validateIdentifier } from "./validate";
import { checkRateLimit } from "../../data/ratelimit";
import { getAccountByIdentifier } from "../../data/accounts";
import { issueCode } from "../../auth/codeStore";
import type { EmailProvider } from "../../email";

export async function handleRequest(req: Request, env: Env, email: EmailProvider): Promise<Response> {
  const identifier = validateIdentifier(await req.json().catch(() => null));
  if (!identifier) return errorResponse(400, "bad_input", "An email or username is required.");
  const now = Date.now();
  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await checkRateLimit(env, "email", identifier, 5, 3600, now)))
    return errorResponse(429, "rate_limited", "Too many attempts. Try again later.");
  if (!(await checkRateLimit(env, "ip", ip, 20, 3600, now)))
    return errorResponse(429, "rate_limited", "Too many attempts. Try again later.");

  const account = await getAccountByIdentifier(env, identifier);
  if (!account) return errorResponse(404, "no_account", "No account found. Sign up first.");
  const code = await issueCode(env, "auth", account.email);
  await email.sendCode({ to: account.email, code, purpose: "auth" });
  return json({ pending: true });
}
```

- [ ] **Step 6: Route adapters** `functions/api/auth/signup.ts` and `request.ts`

```ts
// functions/api/auth/signup.ts
import type { Env } from "../../../shared/env";
import { handleSignup } from "../../../shared/handlers/auth/signup";
import { createResendProvider, FROM_ADDRESS } from "../../../shared/email";

export const onRequestPost = (ctx: { request: Request; env: Env }) =>
  handleSignup(ctx.request, ctx.env, createResendProvider(ctx.env.RESEND_API_KEY, FROM_ADDRESS));
```
(request.ts is identical with `handleRequest`.)

- [ ] **Step 7:** Run `npm test`, `npm run typecheck`, `npm --prefix functions run typecheck` - all clean. Commit.
`git add -A && git commit -m "feat(hosted): dev seed, validation, signup + request handlers"`

---

### Task 5: verify, logout, me handlers and session extraction

**Files:** Create `shared/auth/requestAuth.ts`, `shared/handlers/auth/verify.ts`, `shared/handlers/auth/logout.ts`, `shared/handlers/me.ts`, `functions/api/auth/verify.ts`, `functions/api/auth/logout.ts`, `functions/api/me.ts`. Tests: `shared/auth/requestAuth.test.ts`, `shared/handlers/auth/verify.test.ts`, `shared/handlers/me.test.ts`.

**Interfaces produced:** `getSessionToken(req): string | null`; `PublicAccount = { username, email, hasKey, isDev, usesDevKey }`; `accountSummary(env, account): Promise<PublicAccount>`; `handleVerify(req, env)`; `handleLogout(req, env)`; `handleMe(req, env)`.

- [ ] **Step 1: requestAuth test + impl** (`shared/auth/requestAuth.test.ts`, then `requestAuth.ts`)

```ts
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { getSessionToken, accountSummary } from "./requestAuth";
import { createAccount } from "../data/accounts";
import { addToAllowlist } from "../data/allowlist";

test("reads token from Authorization bearer and from cookie", () => {
  const bearer = new Request("http://x", { headers: { Authorization: "Bearer tok123" } });
  expect(getSessionToken(bearer)).toBe("tok123");
  const cookie = new Request("http://x", { headers: { Cookie: "other=1; fb_session=tok456; z=2" } });
  expect(getSessionToken(cookie)).toBe("tok456");
  expect(getSessionToken(new Request("http://x"))).toBeNull();
});

test("accountSummary sets usesDevKey for allow-listed emails", async () => {
  const acc = await createAccount(env, { username: "friend", email: "friend@example.com" });
  expect((await accountSummary(env, acc)).usesDevKey).toBe(false);
  await addToAllowlist(env, "friend@example.com");
  expect((await accountSummary(env, acc)).usesDevKey).toBe(true);
});
```

```ts
// requestAuth.ts
import type { Env } from "../env";
import type { Account } from "../data/accounts";
import { isAllowlisted } from "../data/allowlist";
import { SESSION_COOKIE_NAME } from "./session";

export interface PublicAccount {
  username: string;
  email: string;
  hasKey: boolean;
  isDev: boolean;
  usesDevKey: boolean;
}

export function getSessionToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.headers.get("Cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) return part.slice(eq + 1).trim();
  }
  return null;
}

export async function accountSummary(env: Env, account: Account): Promise<PublicAccount> {
  const usesDevKey = account.isDev || (await isAllowlisted(env, account.email));
  return {
    username: account.username,
    email: account.email,
    hasKey: account.hasKey,
    isDev: account.isDev,
    usesDevKey,
  };
}
```

- [ ] **Step 2: verify handler test + impl** (`shared/handlers/auth/verify.test.ts`, then `verify.ts`)

```ts
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleVerify } from "./verify";
import { createAccount, getAccountByIdentifier } from "../../data/accounts";
import { issueCode } from "../../auth/codeStore";
import { verifySession } from "../../auth/session";
import { getSessionToken } from "../../auth/requestAuth";

function req(body: unknown): Request {
  return new Request("http://x/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("correct code verifies the account and issues a session cookie + token", async () => {
  await createAccount(env, { username: "ver", email: "ver@example.com" });
  const code = await issueCode(env, "auth", "ver@example.com");
  const res = await handleVerify(req({ identifier: "ver", code }), env);
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("Set-Cookie") ?? "";
  expect(setCookie).toContain("fb_session=");
  expect(setCookie).toContain("HttpOnly");
  const body = await res.json() as { token: string; account: { username: string; usesDevKey: boolean } };
  expect(body.account.username).toBe("ver");
  // token is a valid session
  expect(await verifySession(body.token, env.SESSION_SECRET, Date.now())).not.toBeNull();
  // account is now verified
  expect((await getAccountByIdentifier(env, "ver"))?.emailVerified).toBe(true);
});

test("wrong code returns 401 and no session", async () => {
  await createAccount(env, { username: "ver2", email: "ver2@example.com" });
  await issueCode(env, "auth", "ver2@example.com");
  const res = await handleVerify(req({ identifier: "ver2", code: "000000" }), env);
  expect(res.status).toBe(401);
  expect(res.headers.get("Set-Cookie")).toBeNull();
});
```

```ts
// verify.ts
import type { Env } from "../../env";
import { errorResponse } from "../../http";
import { getAccountByIdentifier, markEmailVerified } from "../../data/accounts";
import { verifyStoredCode } from "../../auth/codeStore";
import { signSession, sessionCookie } from "../../auth/session";
import { accountSummary } from "../../auth/requestAuth";

export async function handleVerify(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { identifier?: unknown; code?: unknown } | null;
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!identifier || !code) return errorResponse(400, "bad_input", "Identifier and code are required.");

  const account = await getAccountByIdentifier(env, identifier);
  const badCode = () => errorResponse(401, "bad_code", "Invalid or expired code.");
  if (!account) return badCode();
  if (!(await verifyStoredCode(env, "auth", account.email, code))) return badCode();

  await markEmailVerified(env, account.id);
  const token = await signSession(account.id, env.SESSION_SECRET, Date.now());
  const summary = await accountSummary(env, { ...account, emailVerified: true });
  return new Response(JSON.stringify({ token, account: summary }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(token) },
  });
}
```

- [ ] **Step 3: logout + me** (`shared/handlers/auth/logout.ts`, `shared/handlers/me.ts`, and `shared/handlers/me.test.ts`)

```ts
// me.test.ts
import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { handleMe } from "./me";
import { createAccount } from "../data/accounts";
import { signSession } from "../auth/session";

test("me returns the account summary for a valid session", async () => {
  const acc = await createAccount(env, { username: "meuser", email: "meuser@example.com" });
  const token = await signSession(acc.id, env.SESSION_SECRET, Date.now());
  const res = await handleMe(new Request("http://x/api/me", { headers: { Authorization: `Bearer ${token}` } }), env);
  expect(res.status).toBe(200);
  const body = await res.json() as { username: string; usesDevKey: boolean; isDev: boolean };
  expect(body.username).toBe("meuser");
  expect(body.isDev).toBe(false);
});

test("me without a token is 401", async () => {
  const res = await handleMe(new Request("http://x/api/me"), env);
  expect(res.status).toBe(401);
});
```

```ts
// logout.ts
import type { Env } from "../../env";
import { clearSessionCookie } from "../../auth/session";

export async function handleLogout(_req: Request, _env: Env): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie() },
  });
}
```

```ts
// me.ts
import type { Env } from "../env";
import { json, errorResponse } from "../http";
import { getSessionToken, accountSummary } from "../auth/requestAuth";
import { verifySession } from "../auth/session";
import { getAccountById } from "../data/accounts";

export async function handleMe(req: Request, env: Env): Promise<Response> {
  const token = getSessionToken(req);
  if (!token) return errorResponse(401, "unauthorized", "Sign in required.");
  const accountId = await verifySession(token, env.SESSION_SECRET, Date.now());
  if (!accountId) return errorResponse(401, "unauthorized", "Sign in required.");
  const account = await getAccountById(env, accountId);
  if (!account) return errorResponse(401, "unauthorized", "Sign in required.");
  return json(await accountSummary(env, account));
}
```

- [ ] **Step 4: Route adapters** `functions/api/auth/verify.ts`, `functions/api/auth/logout.ts`, `functions/api/me.ts` (verify/logout are POST, me is GET; verify/logout/me take only `(request, env)` - no email provider).

```ts
// functions/api/me.ts
import type { Env } from "../../shared/env";
import { handleMe } from "../../shared/handlers/me";
export const onRequestGet = (ctx: { request: Request; env: Env }) => handleMe(ctx.request, ctx.env);
```

- [ ] **Step 5:** Run `npm test`, `npm run typecheck`, `npm --prefix functions run typecheck` - all clean. Commit.
`git add -A && git commit -m "feat(hosted): verify, logout, me handlers + session extraction"`

---

## Self-Review

- **Spec coverage:** §4.1 signup -> Task 4; §4.2 request/no_account -> Task 4; §4.3 verify + session cookie + token -> Task 5; logout -> Task 5; §10 `GET /api/me` shape -> Task 5; §8 rate limiting -> Task 2 + wired in Task 4; §4 code lifecycle (10-min, 5-attempt) -> Task 3; email sending -> Task 1; dev reservation + unverified re-issue (whole-plan carry-forwards) -> Task 4. Key reveal/edit, allowlist admin endpoints, and generate are Plan 03; the client is Plan 04.
- **Placeholder scan:** none. The dev seed's `created_at` is a fixed literal (migrations cannot call `Date.now()`), which is intentional.
- **Type consistency:** `PublicAccount` defined once (Task 5) and returned by `accountSummary`, consumed by verify + me; `EmailProvider`/`CodeEmail` defined in Task 1 and consumed by Tasks 4-5; `issueCode`/`verifyStoredCode` purposes are the `"auth" | "key"` union throughout; codes keyed by the account's canonical email in both issue and verify.
- **Carry-forward compliance:** username `@` rejected (validate.ts); dev identity reserved (seed migration + duplicate handling); existing-unverified re-issues rather than errors (signup.ts); duplicate messaging is generic. The Plan 03 `typ: "key-edit"` convention is noted for the next plan, not implemented here.
