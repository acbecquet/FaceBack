# FaceBack deploy runbook

This is the operator runbook for provisioning and deploying FaceBack.
It is written for the owner (Charlie or Alexander) setting up the hosted app on Cloudflare for the first time.
Follow the numbered sections in order.
Each section gives the exact commands to run.

Before you start, you need:
- A Cloudflare account, with `wrangler` installed and logged in (`npx wrangler login`).
- A Resend account for sending sign-in codes.
- Access to the Squarespace DNS panel for `acb-apps.com`.
- A Gemini API key to use as the shared friends-and-family key.

The app is served at `faceback.acb-apps.com`.
The backend is a single Cloudflare Pages project: a static React build plus a `functions/` directory of Pages Functions, backed by one D1 database and one KV namespace.
All of this is already wired up in the repo's `wrangler.toml`; provisioning mostly means creating the real Cloudflare resources and pasting their ids in.

## 1. Provision Cloudflare resources

Create the D1 database and the KV namespace under the owner's Cloudflare account.

```
npx wrangler d1 create faceback
npx wrangler kv namespace create faceback-kv
```

Each command prints an id.
Open `wrangler.toml` at the repo root and replace the two `"local"` placeholders with the real ids: the D1 id goes in `database_id` under `[[d1_databases]]`, and the KV id goes in `id` under `[[kv_namespaces]]`.
Commit that change, since both local dev and the deployed Pages project read the same `wrangler.toml`.

Then apply the schema migrations to the new remote D1 database.

```
npx wrangler d1 migrations apply faceback --remote
```

This runs `migrations/0001_init.sql` (creates the `accounts` and `dev_allowlist` tables) and `migrations/0002_seed_dev.sql` (seeds the `dev` / `alexanderbecquet0@gmail.com` account row so the owner can sign in immediately, with nothing else to configure).

## 2. Create the Pages project

Create the Pages project once, then connect it to the repo for ongoing deploys, or deploy manually from the CLI.

```
npx wrangler pages project create faceback --production-branch=main
```

If the name `faceback` is already taken globally on `*.pages.dev`, Cloudflare assigns a different project subdomain; use whatever it prints in the DNS step below.

For ongoing deploys, connect the GitHub repo to this Pages project from the Cloudflare dashboard (Workers & Pages > the project > Settings > Builds), with:
- Build command: `npm --prefix web run build`
- Build output directory: `web/dist`
- Root directory: repo root (leave blank), so the `functions/` directory at the repo root is auto-detected as the Pages Functions for `/api/**`.

For a first manual deploy without waiting on Git integration, build locally and push the build with wrangler:

```
npm --prefix web run build
npx wrangler pages deploy web/dist --project-name=faceback
```

Because `wrangler.toml` already declares the D1 and KV bindings (Section 1) under `pages_build_output_dir`, both the Git-connected build and the CLI deploy pick up the same bindings automatically; there is no separate dashboard binding step to do.

## 3. Set secrets

Three secrets must be set on the Pages project before anything works: `SESSION_SECRET`, `KEY_ENC_SECRET`, and `RESEND_API_KEY`.
Generate strong random values for the first two.

```
openssl rand -base64 32
openssl rand -base64 32
```

Set all three either from the Cloudflare dashboard (the project > Settings > Environment variables, add as "Secret", not "Plaintext"), or with wrangler:

```
npx wrangler pages secret put SESSION_SECRET --project-name=faceback
npx wrangler pages secret put KEY_ENC_SECRET --project-name=faceback
npx wrangler pages secret put RESEND_API_KEY --project-name=faceback
```

`wrangler pages secret put` prompts for the value on stdin, so paste the generated value for the first two, and the Resend API key (from Section 4) for the third.
None of these three values are ever committed to the repo; `.dev.vars` is gitignored and production only has the Pages secrets.

## 4. Configure Resend

Sign up at Resend and add `acb-apps.com` as a sending domain.
Resend will list DKIM, SPF, and a domain-verification record.
Add all of those records at Squarespace DNS (the domain's authoritative DNS host), not at Cloudflare, since `acb-apps.com` stays hosted at Squarespace by default.
Wait for Resend to show the domain as verified before relying on delivery.

Create a Resend API key and set it as the `RESEND_API_KEY` secret (Section 3).
The app sends every code email from `faceback@acb-apps.com`; this sender address is hardcoded in the codebase (`shared/email.ts`), so no further configuration is needed once the domain is verified.

## 5. Configure DNS at Squarespace

At Squarespace DNS for `acb-apps.com`, add a CNAME record:
- Host: `faceback`
- Points to: `<project>.pages.dev` (the Pages project's own subdomain from Section 2, for example `faceback.pages.dev`)

Then, in the Cloudflare Pages project (Settings > Custom domains), add the custom domain `faceback.acb-apps.com`.
Cloudflare validates it against the CNAME you just added and issues the TLS certificate automatically.
This can take a few minutes to propagate.

## 6. Bootstrap the dev account

Once the app is live, open `https://faceback.acb-apps.com`.

Sign in with the identifier `dev` or `alexanderbecquet0@gmail.com` on the sign-in screen (this is "sign in", not "create account"; the account already exists from the seed migration in Section 1).
Click "Send code" and check `alexanderbecquet0@gmail.com` for the 6-digit code, then enter it and click "Verify".

The dev account is always treated as using the shared key, so it skips the new-user "add your key" onboarding screen and goes straight into the camera app.
To add the Gemini key that will be shared with friends, open Settings from the camera screen, then:
1. Click "View / edit API key". This emails a fresh 6-digit code to `alexanderbecquet0@gmail.com`.
2. Enter that code and click "Unlock".
3. Paste the Gemini API key into the API key field and click "Save key".

This key is now both the dev account's own key and the one shared key that every allowlisted friend's generations run against; the server always spends the dev account's key for any account that counts as "using the dev key".

Still in Settings, the dev account has a "Manage invites" section not shown to other accounts.
Add each friend's email there.
Once added, that person can sign in with their own email (they create their own account with a username and that email), and their generations spend the shared dev key automatically, up to the per-friend daily cap, without ever entering a Gemini key of their own.

## 7. Local development

To run the full app locally against a local D1 database and local KV, with no Cloudflare account needed:

Build the web app.

```
npm --prefix web run build
```

Apply the migrations to a local D1 database (this creates local SQLite-backed state under `.wrangler/`, separate from any remote database).

```
npx wrangler d1 migrations apply faceback --local
```

Create a `.dev.vars` file at the repo root with dev placeholder secrets (this file is gitignored; confirm with `git check-ignore -v .dev.vars`).

```
SESSION_SECRET=<any random string, e.g. output of `openssl rand -base64 32`>
KEY_ENC_SECRET=<any random string, e.g. output of `openssl rand -base64 32`>
RESEND_API_KEY=<any placeholder string for local dev; a real re_... key is only needed to actually send email>
```

A placeholder `RESEND_API_KEY` is fine for local dev as long as you never exercise a code path that actually calls Resend's API with it (sign-in and key-edit codes will fail to send, but every other route and the D1/KV-backed logic works).

Before starting the dev server, remove any local install of `functions/node_modules` if present.

```
rm -rf functions/node_modules
```

This is required because `wrangler pages dev` auto-detects the `functions/` directory and bundles every file under it to build its routes; if `functions/node_modules` exists (from having run `npm --prefix functions install` to typecheck or test the functions package), the bundler tries to compile packages inside it as if they were route files and fails with an error like "Failed to build Functions at ./functions", tripping over a `.d.ts` file inside `nanoid`.
This only affects local dev on a machine where that install has happened; a fresh Cloudflare Pages build never has this directory, since it is gitignored, so remote deploys are unaffected.
If you need to run `npm --prefix functions test` or `npm --prefix functions run typecheck` again afterward, just reinstall with `npm --prefix functions install`.

Start the dev server, which serves the static build and the `functions/api/**` routes together against the local D1 and KV bindings declared in `wrangler.toml`.

```
npx wrangler pages dev web/dist
```

Confirm it is serving both the SPA and the API, for example:

```
curl http://localhost:8788/
curl -X POST http://localhost:8788/api/auth/request -H "content-type: application/json" -d "{}"
```

The first returns the SPA's `index.html`.
The second returns a JSON error envelope such as `{"error":{"code":"bad_input","message":"An email or username is required."}}`, not a 404, confirming the function route is really mounted and reachable, not falling through to the static SPA fallback.

Stop the server with Ctrl-C, or `pkill -f "wrangler pages dev"` if it was started in the background.

## 8. Known limitation

The per-friend and global daily generation caps, and the request rate limiters on the code-issuing endpoints, are all implemented as plain KV counters.
KV is eventually consistent, not strongly consistent, so a burst of concurrent requests can momentarily read a stale counter value and let a small number of extra generations or code requests through past the configured cap.
At friends-and-family scale this overspend is negligible and is an accepted tradeoff, not a bug to chase.
If usage ever grows enough for this to matter, the fix is to move the counters into a Cloudflare Durable Object, which serializes access per key and enforces the cap exactly; this is a contained upgrade that does not change the API surface.

## 9. End-to-end smoke test

After deploying and bootstrapping the dev account, verify the whole path as a real user would experience it:

1. From a browser, go to `https://faceback.acb-apps.com` and create a new account with a username and an email address (use a friend's allowlisted email, or your own second address, to exercise the shared-key path; use any other email to exercise the own-key path).
2. Receive the sign-up code by email and enter it to verify and sign in.
3. If the email is allowlisted, generation should work immediately against the shared dev key; otherwise, add a personal Gemini key when prompted by the onboarding screen.
4. Take or upload a clear front-of-head photo.
5. Confirm the app generates and displays a plausible back-of-head image, and that it is saved into "Your Backs" (the collection screen).

If every step above works without errors, the deploy is healthy end to end.
