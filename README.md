# FaceBack

Take a photo of the front of someone's head, get back a photorealistic render of the *back* of their head.

A small parody app in the spirit of "it's just the back of their head" from *The Other Guys*.
It is a hosted, multi-user web app: anyone can sign up, add their own Google Gemini API key, and generate.

## What it does

1. You sign in with a passwordless email code (enter your username or email, receive a 6-digit code).
2. You add your own Gemini API key, which is encrypted and stored server-side (it never comes back to the browser).
3. You take or upload a front-of-head photo.
4. The server sends it to Google's Gemini image model with a fixed, hardened prompt and returns the back-of-head render.

There is also one shared **dev** account that holds the owner's key behind an invite-only allowlist, so invited friends can try the app without supplying their own key (subject to per-friend and global daily caps).

## How it works

| Layer | Technology |
| --- | --- |
| Hosting | Cloudflare Pages + Pages Functions (`functions/api/**`) |
| Database | Cloudflare D1 (SQLite) for accounts and the allowlist |
| Ephemeral state | Cloudflare KV for auth codes, rate limits, and usage counters |
| Image generation | Google Gemini `gemini-3.1-flash-image` via the Interactions API |
| Email | Resend (delivers the sign-in and key-edit codes) |
| Client | React 18 + Vite + TypeScript, same-origin API, session cookie |

Framework-agnostic request handlers live in `shared/` and are exercised directly in tests; the thin files under `functions/api/` just adapt Cloudflare's routing to those handlers.

## Security

- The generation prompt is server-side only, is never shipped to the client, and instructs the model to ignore any text or instructions embedded inside the input image (defense against prompt injection through the photo).
- API keys are encrypted at rest with AES-256-GCM and are never returned to any client; a friend using the shared dev key never sees it.
- Sign-in and key-edit codes are single-use, short-lived, hashed at rest, attempt-limited, and rate-limited.
- Sessions are HMAC-signed, HttpOnly, Secure cookies; viewing or editing your stored key requires a fresh emailed code.
- Usage caps and rate limits are enforced server-side (the client is never trusted to enforce them).

## Project structure

```
shared/       Framework-agnostic handlers, crypto, auth, data access, email, prompt
functions/    Cloudflare Pages Functions that adapt routing to the shared handlers
migrations/   D1 schema and the dev-account seed
web/          React + Vite client
test/         Backend tests (run in the real Workers runtime against local D1/KV)
docs/         Design spec, implementation plans, and the deploy runbook
```

## Local development

```
npm install
npm --prefix web install
npm --prefix web run build

# Apply migrations to a local D1 database (creates local state under .wrangler/)
npx wrangler d1 migrations apply faceback --local

# Create a gitignored .dev.vars with local placeholder secrets (see docs/superpowers/DEPLOY.md)
# SESSION_SECRET, KEY_ENC_SECRET, RESEND_API_KEY

# If functions/node_modules exists, remove it first (it breaks the Pages dev bundler)
rm -rf functions/node_modules

npx wrangler pages dev
```

Tests:

```
npm test              # backend handlers against the real Workers runtime + local D1/KV
npm --prefix web test # client
```

## Deployment

The full owner runbook (provisioning D1 and KV, applying migrations, creating the Pages project, setting production secrets, configuring Resend, pointing the custom domain, and bootstrapping the dev account) is in [`docs/superpowers/DEPLOY.md`](docs/superpowers/DEPLOY.md).

## Roadmap

- **Phase 1 (this repo):** the hosted web app.
- **Phase 2 (planned):** a native SwiftUI iOS client built against this same backend.

## License

[MIT](LICENSE)
