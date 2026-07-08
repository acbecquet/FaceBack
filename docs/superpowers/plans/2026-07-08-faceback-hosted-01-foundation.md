# FaceBack Hosted - Plan 01: Backend Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Cloudflare Pages Functions backend skeleton with a real local D1 + KV test harness, and build the tested server-side primitives every later plan depends on: at-rest key encryption, auth-code hashing, session tokens, and the accounts / allowlist / usage data layer.

**Architecture:** A new top-level `shared/` holds framework-agnostic TypeScript (pure `(Request, Env) => Promise<Response>` handlers and libraries), imported both by unit tests and by thin Cloudflare route adapters under `functions/`. Durable state lives in Cloudflare D1 (SQLite); ephemeral state (login codes, daily counters, rate limits) lives in Cloudflare KV. Tests run in the Workers runtime via `@cloudflare/vitest-pool-workers`, so D1 and KV are the real local implementations, never mocks.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, Cloudflare D1, Cloudflare KV, Wrangler, Vitest with `@cloudflare/vitest-pool-workers`, Web Crypto (`crypto.subtle`, available natively in the Workers runtime).

## Global Constraints

- Reuse, do not rewrite, the Phase 1 libraries `functions/src/lib/{http,prompt,gemini,tokens}.ts` by moving them into `shared/`. The generation hardening pipeline and the tamper-proof prompt are carried forward unchanged.
- Delete the Phase 1 PIN-recovery function and its tests; email codes replace PIN recovery entirely. There is no PIN anywhere.
- Auth and key-reveal codes: 6 digits, 10-minute TTL, single use, maximum 5 verification attempts then burned, stored only as a salted hash, compared in constant time.
- Caps (enforced in a later plan, but the counters live here): 10 successful generations per allowlisted friend email per day, 200 per day globally.
- Session tokens are HMAC-SHA256 signed, carry a 1-year expiry, and are treated as "valid until logout."
- Stored API keys are encrypted at rest with AES-256-GCM under a key derived from the `KEY_ENC_SECRET` binding; plaintext keys are never persisted and never logged.
- Usernames and emails are stored lowercased and trimmed, and are unique.
- No em dash characters anywhere (use a plain hyphen). No emoji in any product-facing string.
- The single dev account is `username = "dev"`, `email = "alexanderbecquet0@gmail.com"`.

## File Structure

- `wrangler.toml` (create) - Pages project config: D1 binding `DB`, KV binding `KV`, build output dir `web/dist`, compatibility date.
- `migrations/0001_init.sql` (create) - D1 schema for `accounts` and `dev_allowlist`.
- `shared/env.ts` (create) - the `Env` type describing bindings and secrets.
- `shared/http.ts`, `shared/prompt.ts`, `shared/gemini.ts`, `shared/tokens.ts` (move from `functions/src/lib/`) - unchanged Phase 1 libraries.
- `shared/crypto/keyCipher.ts` (create) - `encryptApiKey` / `decryptApiKey` (AES-GCM at rest, HKDF from `KEY_ENC_SECRET`).
- `shared/crypto/codes.ts` (create) - `generateCode`, `hashCode`, `verifyCode` (salted PBKDF2, constant-time), and `timingSafeEqual` (reused from `shared/tokens.ts`).
- `shared/auth/session.ts` (create) - `signSession`, `verifySession`, `sessionCookie`, `clearSessionCookie`.
- `shared/data/accounts.ts` (create) - the accounts D1 data-access layer.
- `shared/data/allowlist.ts` (create) - the dev allowlist D1 data-access layer.
- `shared/data/usage.ts` (create) - KV daily usage counters + cap check.
- `functions/api/health.ts` (create) - a trivial route proving the harness end to end.
- `vitest.config.ts` (create) - `@cloudflare/vitest-pool-workers` config.
- `test/apply-migrations.ts` (create) - test setup that applies D1 migrations before each suite.
- Delete: `functions/src/recovery.ts`, `functions/src/recovery.test.ts`, and `web/vite-functions-plugin.ts` (superseded by `wrangler pages dev`, wired in Plan 04).

Note on `functions/src/generate.ts`: it is moved to `shared/handlers/generate.ts` and adapted in Plan 03; in this plan only the `lib/` files move.

---

### Task 1: Cloudflare scaffolding, repo reorg, and the real D1 + KV test harness

**Files:**
- Create: `wrangler.toml`, `migrations/0001_init.sql`, `shared/env.ts`, `vitest.config.ts`, `test/apply-migrations.ts`, `functions/api/health.ts`, `functions/tsconfig.json`
- Move: `functions/src/lib/{http,prompt,gemini,tokens}.ts` and their tests into `shared/` (update import paths)
- Delete: `functions/src/recovery.ts`, `functions/src/recovery.test.ts`
- Test: `shared/health.test.ts`

**Interfaces:**
- Produces: `Env` (in `shared/env.ts`) with `{ DB: D1Database; KV: KVNamespace; KEY_ENC_SECRET: string; SESSION_SECRET: string; RESEND_API_KEY: string }`.
- Produces: the `functions/api/*` route convention - each file exports `onRequestPost`/`onRequestGet(context)` and delegates to a `shared/` handler with `context.env`.

- [ ] **Step 1: Add Cloudflare + Vitest tooling**

Run:
```bash
cd /home/acbecquet/projects/faceback/.claude/worktrees/phase1
npm i -D -w functions wrangler @cloudflare/vitest-pool-workers @cloudflare/workers-types vitest || \
  npm i -D wrangler @cloudflare/vitest-pool-workers @cloudflare/workers-types vitest
```
(If the repo is not an npm workspace, install at the `functions` package root that owns the current function tests.)
Expected: packages installed, no errors.

- [ ] **Step 2: Write `wrangler.toml`**

```toml
name = "faceback"
compatibility_date = "2026-06-01"
pages_build_output_dir = "web/dist"

[[d1_databases]]
binding = "DB"
database_name = "faceback"
# database_id is filled at provisioning time from `wrangler d1 create faceback`.
# Local tests and `wrangler pages dev` do not require the remote id.
database_id = "local"

[[kv_namespaces]]
binding = "KV"
# id is filled at provisioning time from `wrangler kv namespace create faceback-kv`.
id = "local"
```

- [ ] **Step 3: Write the D1 schema `migrations/0001_init.sql`**

```sql
CREATE TABLE accounts (
  id             TEXT PRIMARY KEY,
  username       TEXT UNIQUE NOT NULL,
  email          TEXT UNIQUE NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  key_ciphertext TEXT,
  key_iv         TEXT,
  is_dev         INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);

CREATE TABLE dev_allowlist (
  email    TEXT PRIMARY KEY,
  added_at TEXT NOT NULL
);
```

- [ ] **Step 4: Write `shared/env.ts`**

```ts
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  KEY_ENC_SECRET: string;
  SESSION_SECRET: string;
  RESEND_API_KEY: string;
}
```

- [ ] **Step 5: Move the Phase 1 libraries into `shared/`**

```bash
git mv functions/src/lib/http.ts    shared/http.ts
git mv functions/src/lib/prompt.ts  shared/prompt.ts
git mv functions/src/lib/gemini.ts  shared/gemini.ts
git mv functions/src/lib/tokens.ts  shared/tokens.ts
# move any co-located tests too, e.g.:
git mv functions/src/lib/tokens.test.ts shared/tokens.test.ts 2>/dev/null || true
git rm functions/src/recovery.ts functions/src/recovery.test.ts
```
Update import paths inside the moved files and their tests so they resolve from `shared/`.

- [ ] **Step 6: Write the test harness config `vitest.config.ts`**

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Bindings the tests need; secrets are injected as plain strings here.
          bindings: {
            KEY_ENC_SECRET: "test-key-enc-secret-value",
            SESSION_SECRET: "test-session-secret-value",
            RESEND_API_KEY: "test-resend-key",
          },
        },
      },
    },
  },
});
```

- [ ] **Step 7: Write the migration-applying test setup `test/apply-migrations.ts`**

```ts
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll } from "vitest";

// Applies migrations/*.sql to the local D1 before the suite runs.
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.MIGRATIONS ?? []);
});
```
If the installed `@cloudflare/vitest-pool-workers` exposes migrations differently, follow its current documented pattern; the requirement is that `env.DB` has the `accounts` and `dev_allowlist` tables before tests run. Wire this file via `test.setupFiles` in `vitest.config.ts`.

- [ ] **Step 8: Write the failing health-route test `shared/health.test.ts`**

```ts
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { handleHealth } from "./handlers/health";

test("health handler reports ok and can read D1", async () => {
  const res = await handleHealth(new Request("http://x/api/health"), env);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toEqual({ ok: true, tables: ["accounts", "dev_allowlist"] });
});
```

- [ ] **Step 9: Run it, verify it fails**

Run: `npx vitest run shared/health.test.ts`
Expected: FAIL - `handleHealth` does not exist.

- [ ] **Step 10: Implement `shared/handlers/health.ts` and the route `functions/api/health.ts`**

`shared/handlers/health.ts`:
```ts
import type { Env } from "../env";
import { json } from "../http";

export async function handleHealth(_req: Request, env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('accounts','dev_allowlist') ORDER BY name",
  ).all<{ name: string }>();
  return json({ ok: true, tables: rows.results.map((r) => r.name) });
}
```

`functions/api/health.ts`:
```ts
import type { Env } from "../../shared/env";
import { handleHealth } from "../../shared/handlers/health";

export const onRequestGet = (ctx: { request: Request; env: Env }) =>
  handleHealth(ctx.request, ctx.env);
```

- [ ] **Step 11: Run tests, verify pass**

Run: `npx vitest run shared/health.test.ts`
Expected: PASS.

- [ ] **Step 12: Confirm the moved Phase 1 library tests still pass**

Run: `npx vitest run shared/`
Expected: PASS for the moved `tokens` (and any other moved) tests.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(hosted): Cloudflare scaffolding, shared/ reorg, real D1+KV test harness"
```

---

### Task 2: At-rest API key encryption

**Files:**
- Create: `shared/crypto/keyCipher.ts`
- Test: `shared/crypto/keyCipher.test.ts`

**Interfaces:**
- Produces: `encryptApiKey(plaintext: string, secret: string): Promise<{ ciphertext: string; iv: string }>` and `decryptApiKey(ciphertext: string, iv: string, secret: string): Promise<string>` (both base64 strings).

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { encryptApiKey, decryptApiKey } from "./keyCipher";

const SECRET = "a-strong-server-secret";

test("round-trips an API key and never stores plaintext", async () => {
  const key = "AIzaSy-example-gemini-key";
  const { ciphertext, iv } = await encryptApiKey(key, SECRET);
  expect(ciphertext).not.toContain(key);
  await expect(decryptApiKey(ciphertext, iv, SECRET)).resolves.toBe(key);
});

test("a wrong secret cannot decrypt", async () => {
  const { ciphertext, iv } = await encryptApiKey("secret-key", SECRET);
  await expect(decryptApiKey(ciphertext, iv, "wrong-secret")).rejects.toBeDefined();
});

test("each encryption uses a fresh iv", async () => {
  const a = await encryptApiKey("k", SECRET);
  const b = await encryptApiKey("k", SECRET);
  expect(a.iv).not.toBe(b.iv);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run shared/crypto/keyCipher.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement `shared/crypto/keyCipher.ts`**

```ts
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("faceback.keycipher.v1"), info: new Uint8Array() },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptApiKey(plaintext: string, secret: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { ciphertext: b64(new Uint8Array(ct)), iv: b64(iv) };
}

export async function decryptApiKey(ciphertext: string, iv: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ciphertext));
  return dec.decode(pt);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run shared/crypto/keyCipher.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/crypto/keyCipher.ts shared/crypto/keyCipher.test.ts
git commit -m "feat(hosted): at-rest API key encryption (AES-GCM via HKDF)"
```

---

### Task 3: Auth-code hashing and session tokens

**Files:**
- Create: `shared/crypto/codes.ts`, `shared/auth/session.ts`
- Test: `shared/crypto/codes.test.ts`, `shared/auth/session.test.ts`

**Interfaces:**
- Produces (codes): `generateCode(): string` (6 digits), `hashCode(code: string): Promise<{ hash: string; salt: string }>`, `verifyCode(code: string, hash: string, salt: string): Promise<boolean>`.
- Produces (session): `signSession(accountId: string, secret: string, nowMs: number): Promise<string>`, `verifySession(token: string, secret: string, nowMs: number): Promise<string | null>` (returns accountId or null), `sessionCookie(token: string): string`, `clearSessionCookie(): string`.

- [ ] **Step 1: Write the failing codes test**

```ts
import { expect, test } from "vitest";
import { generateCode, hashCode, verifyCode } from "./codes";

test("generateCode returns 6 digits", () => {
  for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
});

test("hash then verify accepts the right code and rejects others", async () => {
  const { hash, salt } = await hashCode("123456");
  expect(hash).not.toContain("123456");
  await expect(verifyCode("123456", hash, salt)).resolves.toBe(true);
  await expect(verifyCode("000000", hash, salt)).resolves.toBe(false);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run shared/crypto/codes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `shared/crypto/codes.ts`**

```ts
import { timingSafeEqual } from "../tokens";

const enc = new TextEncoder();
const ITERATIONS = 210_000;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function generateCode(): string {
  // Rejection-sampled uniform 6-digit code, no modulo bias.
  const max = 1_000_000;
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(n % max).padStart(6, "0");
}

async function derive(code: string, salt: Uint8Array): Promise<string> {
  const material = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    material,
    256,
  );
  return b64(new Uint8Array(bits));
}

export async function hashCode(code: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derive(code, saltBytes), salt: b64(saltBytes) };
}

export async function verifyCode(code: string, hash: string, salt: string): Promise<boolean> {
  const candidate = await derive(code, unb64(salt));
  return timingSafeEqual(candidate, hash);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run shared/crypto/codes.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing session test**

```ts
import { expect, test } from "vitest";
import { signSession, verifySession, sessionCookie, clearSessionCookie } from "./session";

const SECRET = "session-secret";
const NOW = 1_800_000_000_000;

test("signed session verifies and yields the account id", async () => {
  const token = await signSession("acc_123", SECRET, NOW);
  await expect(verifySession(token, SECRET, NOW + 1000)).resolves.toBe("acc_123");
});

test("a tampered or wrong-secret token is rejected", async () => {
  const token = await signSession("acc_123", SECRET, NOW);
  await expect(verifySession(token, "other", NOW)).resolves.toBeNull();
  await expect(verifySession(token + "x", SECRET, NOW)).resolves.toBeNull();
});

test("an expired token (beyond 1 year) is rejected", async () => {
  const token = await signSession("acc_123", SECRET, NOW);
  const overAYear = NOW + 366 * 24 * 60 * 60 * 1000;
  await expect(verifySession(token, SECRET, overAYear)).resolves.toBeNull();
});

test("cookie helpers set HttpOnly Secure and clear", () => {
  expect(sessionCookie("t")).toMatch(/HttpOnly/);
  expect(sessionCookie("t")).toMatch(/Secure/);
  expect(clearSessionCookie()).toMatch(/Max-Age=0/);
});
```

- [ ] **Step 6: Run, verify fail**

Run: `npx vitest run shared/auth/session.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implement `shared/auth/session.ts`**

```ts
import { signToken, verifyToken } from "../tokens";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const COOKIE = "fb_session";

export async function signSession(accountId: string, secret: string, nowMs: number): Promise<string> {
  return signToken({ sub: accountId, exp: nowMs + ONE_YEAR_MS }, secret);
}

export async function verifySession(token: string, secret: string, nowMs: number): Promise<string | null> {
  const payload = await verifyToken<{ sub: string; exp: number }>(token, secret);
  if (!payload) return null;
  if (typeof payload.exp !== "number" || nowMs >= payload.exp) return null;
  return typeof payload.sub === "string" ? payload.sub : null;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(ONE_YEAR_MS / 1000)}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export const SESSION_COOKIE_NAME = COOKIE;
```
If `shared/tokens.ts` does not already expose `signToken`/`verifyToken` with an injectable payload and a generic verify, adapt this task to its actual exported signatures (it was built in Phase 1 with `signToken`/`verifyToken` and an injected `nowMs`); keep the behavior the tests assert.

- [ ] **Step 8: Run, verify pass**

Run: `npx vitest run shared/auth/session.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add shared/crypto/codes.ts shared/crypto/codes.test.ts shared/auth/session.ts shared/auth/session.test.ts
git commit -m "feat(hosted): auth-code hashing and signed session tokens"
```

---

### Task 4: Accounts data-access layer

**Files:**
- Create: `shared/data/accounts.ts`
- Test: `shared/data/accounts.test.ts`

**Interfaces:**
- Produces types: `Account = { id, username, email, emailVerified, hasKey, isDev }` and internal `AccountRow`.
- Produces functions:
  - `createAccount(env, { username, email, isDev? }): Promise<Account>` (throws `DuplicateAccountError` on unique conflict).
  - `getAccountByIdentifier(env, identifier): Promise<Account | null>` (identifier is username or email; `@` means email).
  - `getAccountById(env, id): Promise<Account | null>`.
  - `markEmailVerified(env, id): Promise<void>`.
  - `setAccountKey(env, id, ciphertext, iv): Promise<void>` and `getAccountKeyCipher(env, id): Promise<{ ciphertext, iv } | null>`.
  - `newId(): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import {
  createAccount, getAccountByIdentifier, getAccountById,
  markEmailVerified, setAccountKey, getAccountKeyCipher, DuplicateAccountError,
} from "./accounts";

test("create then look up by username and by email", async () => {
  const acc = await createAccount(env, { username: "Alice", email: "Alice@Example.com" });
  expect(acc.username).toBe("alice");
  expect(acc.email).toBe("alice@example.com");
  expect(acc.emailVerified).toBe(false);
  expect(acc.hasKey).toBe(false);
  expect(await getAccountByIdentifier(env, "alice")).toMatchObject({ id: acc.id });
  expect(await getAccountByIdentifier(env, "alice@example.com")).toMatchObject({ id: acc.id });
  expect(await getAccountById(env, acc.id)).toMatchObject({ id: acc.id });
});

test("duplicate username or email is rejected", async () => {
  await createAccount(env, { username: "bob", email: "bob@example.com" });
  await expect(createAccount(env, { username: "bob", email: "other@example.com" }))
    .rejects.toBeInstanceOf(DuplicateAccountError);
  await expect(createAccount(env, { username: "other", email: "bob@example.com" }))
    .rejects.toBeInstanceOf(DuplicateAccountError);
});

test("verify flag and key storage round-trip", async () => {
  const acc = await createAccount(env, { username: "carol", email: "carol@example.com" });
  await markEmailVerified(env, acc.id);
  await setAccountKey(env, acc.id, "CIPHER", "IV");
  expect(await getAccountKeyCipher(env, acc.id)).toEqual({ ciphertext: "CIPHER", iv: "IV" });
  expect((await getAccountById(env, acc.id))!.hasKey).toBe(true);
  expect((await getAccountById(env, acc.id))!.emailVerified).toBe(true);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run shared/data/accounts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `shared/data/accounts.ts`**

```ts
import type { Env } from "../env";

export interface Account {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  hasKey: boolean;
  isDev: boolean;
}

export class DuplicateAccountError extends Error {
  constructor() {
    super("username or email already exists");
    this.name = "DuplicateAccountError";
  }
}

export function newId(): string {
  return "acc_" + crypto.randomUUID();
}

const norm = (s: string) => s.trim().toLowerCase();

interface Row {
  id: string; username: string; email: string;
  email_verified: number; key_ciphertext: string | null; key_iv: string | null; is_dev: number;
}
const toAccount = (r: Row): Account => ({
  id: r.id, username: r.username, email: r.email,
  emailVerified: r.email_verified === 1, hasKey: r.key_ciphertext != null, isDev: r.is_dev === 1,
});

export async function createAccount(
  env: Env, input: { username: string; email: string; isDev?: boolean },
): Promise<Account> {
  const id = newId();
  const username = norm(input.username);
  const email = norm(input.email);
  try {
    await env.DB.prepare(
      "INSERT INTO accounts (id, username, email, email_verified, is_dev, created_at) VALUES (?, ?, ?, 0, ?, ?)",
    ).bind(id, username, email, input.isDev ? 1 : 0, new Date().toISOString()).run();
  } catch (e) {
    if (String((e as Error).message).includes("UNIQUE")) throw new DuplicateAccountError();
    throw e;
  }
  return { id, username, email, emailVerified: false, hasKey: false, isDev: !!input.isDev };
}

export async function getAccountByIdentifier(env: Env, identifier: string): Promise<Account | null> {
  const value = norm(identifier);
  const col = value.includes("@") ? "email" : "username";
  const row = await env.DB.prepare(`SELECT * FROM accounts WHERE ${col} = ?`).bind(value).first<Row>();
  return row ? toAccount(row) : null;
}

export async function getAccountById(env: Env, id: string): Promise<Account | null> {
  const row = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<Row>();
  return row ? toAccount(row) : null;
}

export async function markEmailVerified(env: Env, id: string): Promise<void> {
  await env.DB.prepare("UPDATE accounts SET email_verified = 1 WHERE id = ?").bind(id).run();
}

export async function setAccountKey(env: Env, id: string, ciphertext: string, iv: string): Promise<void> {
  await env.DB.prepare("UPDATE accounts SET key_ciphertext = ?, key_iv = ? WHERE id = ?")
    .bind(ciphertext, iv, id).run();
}

export async function getAccountKeyCipher(env: Env, id: string): Promise<{ ciphertext: string; iv: string } | null> {
  const row = await env.DB.prepare("SELECT key_ciphertext, key_iv FROM accounts WHERE id = ?")
    .bind(id).first<{ key_ciphertext: string | null; key_iv: string | null }>();
  if (!row || row.key_ciphertext == null || row.key_iv == null) return null;
  return { ciphertext: row.key_ciphertext, iv: row.key_iv };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run shared/data/accounts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/data/accounts.ts shared/data/accounts.test.ts
git commit -m "feat(hosted): accounts data-access layer on D1"
```

---

### Task 5: Dev allowlist and daily usage counters

**Files:**
- Create: `shared/data/allowlist.ts`, `shared/data/usage.ts`
- Test: `shared/data/allowlist.test.ts`, `shared/data/usage.test.ts`

**Interfaces:**
- Produces (allowlist): `addToAllowlist(env, email)`, `removeFromAllowlist(env, email)`, `isAllowlisted(env, email): Promise<boolean>`, `listAllowlist(env): Promise<string[]>`.
- Produces (usage): `dayKey(nowMs): string`, `getUsage(env, email, nowMs): Promise<{ friend: number; global: number }>`, `incrementUsage(env, email, nowMs): Promise<void>`, `overCap(usage, isOwner): boolean` with `FRIEND_CAP = 10`, `GLOBAL_CAP = 200`.

- [ ] **Step 1: Write the failing allowlist test**

```ts
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { addToAllowlist, removeFromAllowlist, isAllowlisted, listAllowlist } from "./allowlist";

test("add, check, list, remove - case-insensitive", async () => {
  await addToAllowlist(env, "Friend@Example.com");
  expect(await isAllowlisted(env, "friend@example.com")).toBe(true);
  expect(await listAllowlist(env)).toContain("friend@example.com");
  await removeFromAllowlist(env, "friend@example.com");
  expect(await isAllowlisted(env, "friend@example.com")).toBe(false);
});
```

- [ ] **Step 2: Run, verify fail; then implement `shared/data/allowlist.ts`**

Run: `npx vitest run shared/data/allowlist.test.ts` (expect FAIL), then:
```ts
import type { Env } from "../env";
const norm = (s: string) => s.trim().toLowerCase();

export async function addToAllowlist(env: Env, email: string): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO dev_allowlist (email, added_at) VALUES (?, ?)")
    .bind(norm(email), new Date().toISOString()).run();
}
export async function removeFromAllowlist(env: Env, email: string): Promise<void> {
  await env.DB.prepare("DELETE FROM dev_allowlist WHERE email = ?").bind(norm(email)).run();
}
export async function isAllowlisted(env: Env, email: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT 1 AS x FROM dev_allowlist WHERE email = ?").bind(norm(email)).first();
  return row != null;
}
export async function listAllowlist(env: Env): Promise<string[]> {
  const rows = await env.DB.prepare("SELECT email FROM dev_allowlist ORDER BY added_at").all<{ email: string }>();
  return rows.results.map((r) => r.email);
}
```

- [ ] **Step 3: Run, verify pass**

Run: `npx vitest run shared/data/allowlist.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing usage test**

```ts
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { getUsage, incrementUsage, overCap, FRIEND_CAP, GLOBAL_CAP } from "./usage";

const NOW = 1_800_000_000_000;

test("increment tracks per-friend and global counts for the day", async () => {
  await incrementUsage(env, "f@example.com", NOW);
  await incrementUsage(env, "f@example.com", NOW);
  const u = await getUsage(env, "f@example.com", NOW);
  expect(u.friend).toBe(2);
  expect(u.global).toBe(2);
});

test("overCap trips at the friend cap for a friend, exempt for the owner", () => {
  expect(overCap({ friend: FRIEND_CAP, global: 5 }, false)).toBe(true);
  expect(overCap({ friend: FRIEND_CAP, global: 5 }, true)).toBe(false);
  expect(overCap({ friend: 0, global: GLOBAL_CAP }, true)).toBe(true);
});
```

- [ ] **Step 5: Run, verify fail; then implement `shared/data/usage.ts`**

Run: `npx vitest run shared/data/usage.test.ts` (expect FAIL), then:
```ts
import type { Env } from "../env";

export const FRIEND_CAP = 10;
export const GLOBAL_CAP = 200;
const TTL = 48 * 60 * 60; // seconds

export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}
const norm = (s: string) => s.trim().toLowerCase();

async function readInt(env: Env, key: string): Promise<number> {
  const v = await env.KV.get(key);
  return v ? parseInt(v, 10) || 0 : 0;
}

export async function getUsage(env: Env, email: string, nowMs: number): Promise<{ friend: number; global: number }> {
  const day = dayKey(nowMs);
  const [friend, global] = await Promise.all([
    readInt(env, `usage:friend:${norm(email)}:${day}`),
    readInt(env, `usage:dev:global:${day}`),
  ]);
  return { friend, global };
}

export async function incrementUsage(env: Env, email: string, nowMs: number): Promise<void> {
  const day = dayKey(nowMs);
  const fKey = `usage:friend:${norm(email)}:${day}`;
  const gKey = `usage:dev:global:${day}`;
  const cur = await getUsage(env, email, nowMs);
  await Promise.all([
    env.KV.put(fKey, String(cur.friend + 1), { expirationTtl: TTL }),
    env.KV.put(gKey, String(cur.global + 1), { expirationTtl: TTL }),
  ]);
}

export function overCap(usage: { friend: number; global: number }, isOwner: boolean): boolean {
  if (usage.global >= GLOBAL_CAP) return true;
  if (!isOwner && usage.friend >= FRIEND_CAP) return true;
  return false;
}
```

- [ ] **Step 6: Run, verify pass**

Run: `npx vitest run shared/data/usage.test.ts`
Expected: PASS.

- [ ] **Step 7: Full suite green, then commit**

Run: `npx vitest run`
Expected: PASS across the moved Phase 1 tests and all new foundation tests.
```bash
git add shared/data/allowlist.ts shared/data/allowlist.test.ts shared/data/usage.ts shared/data/usage.test.ts
git commit -m "feat(hosted): dev allowlist and daily usage counters"
```

---

## Self-Review

- **Spec coverage:** §5.1 at-rest key encryption -> Task 2. §4 code hashing -> Task 3. §4.3 sessions -> Task 3. §9.1 accounts + allowlist schema/DAL -> Tasks 1, 4, 5. §7 caps counters -> Task 5. §12 Cloudflare + local test harness -> Task 1. §4.4/§10 key reveal, auth handlers, allowlist endpoints, generate: intentionally deferred to Plans 02-03 (this plan builds the primitives they call).
- **Placeholder scan:** the only non-literal values are `database_id`/`id` in `wrangler.toml` and the `applyD1Migrations` wiring, both explicitly provisioning/tooling steps with the command or doc reference given, not logic placeholders.
- **Type consistency:** `Account` shape is defined once in Task 4 and consumed by name; `overCap({friend,global}, isOwner)` matches `getUsage`'s return; `verifySession` returns `accountId | null` as consumed by later plans; cap constants `FRIEND_CAP`/`GLOBAL_CAP` match the spec's 10/200.
- **Caveat flagged for the implementer:** the exact `@cloudflare/vitest-pool-workers` migration-application API should be confirmed against its installed version in Task 1; the requirement (real D1 tables present before tests) is fixed even if the wiring differs.
