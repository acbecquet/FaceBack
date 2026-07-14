---
date: 2026-07-14T18:20:54Z
timezone: UTC
researcher: acbecquet (Charlie)
git_commit: c8aff77b821c64eb64f60cabd2a3eba93d577421
branch: main
repository: acbecquet/FaceBack
topic: "FaceBack native iOS/macOS (SwiftUI) port - handoff to a fresh session"
tags: [faceback, ios, macos, swiftui, xcode, port, cloudflare, handoff]
status: ready
type: handoff
last_updated: 2026-07-14
---

# FaceBack: handoff for the native iOS/macOS (SwiftUI) port

## Task(s)

**Done (this session and prior):**
The FaceBack web app is feature-complete and deployed to production on Cloudflare Pages plus Pages Functions.
It is a React + Vite + TypeScript single-page app (a phone-shaped web UI) backed by a stateless Cloudflare Functions API with D1 (SQL) and KV storage.
This session was a polish pass: it shipped the iPhone "Your Backs" save fix, the side-by-side result screen, and consistent front-camera mirroring, all landed on `main` and deployed.

**Planned (the next session's job):**
Begin a native iOS/macOS app in Xcode using SwiftUI that ports FaceBack, reusing the existing Cloudflare backend rather than reimplementing it.
The very first sub-task is standing up a macOS development environment, because Charlie has no Mac (see Action Items).
The intended process is the same one that built the web app: superpowers `brainstorming` -> `writing-plans` -> `subagent-driven-development`.

## Critical References

- `docs/superpowers/specs/2026-07-07-faceback-design.md` - the original product and UX design spec (what FaceBack is and how each screen behaves).
- `docs/superpowers/specs/2026-07-08-faceback-hosted-accounts-design.md` - the hosted accounts, auth, and API-key security design.
- `web/src/units/apiClient.ts` - the single file that enumerates the entire backend API the native client must call (see the API contract in Other Notes).
- `docs/superpowers/DEPLOY.md` and `README.md` - deploy runbook and project overview.

## Recent Changes

All of the following are on `main` at commit `c8aff77` and are deployed.

- `web/src/units/collection.ts` - the "Your Backs" library now stores image bytes as an `ArrayBuffer` (not a `Blob`) in IndexedDB, reconstructs the `Blob` on read (tolerant of any legacy Blob records), and adds `newId()` using `crypto.getRandomValues`.
- `web/src/setupTests.ts` - polyfills jsdom's missing `Blob.arrayBuffer()` via `FileReader` so the collection round-trip is testable.
- `web/src/App.tsx` - `handleSave` uses `newId()`, surfaces a message if the library write fails (no more silent swallow), and `result` now carries `originalUrl` for the side-by-side view.
- `web/src/ui/screens/Result.tsx` - shows the original photo (left) and the generated back (right) side by side.
- `web/src/ui/screens/Camera.tsx` and `web/src/units/camera.ts:20` - the front camera is mirrored consistently: the preview uses `scaleX(-1)` and `captureFrame(video, mirror)` flips the saved frame to match (what you frame is what you get).
- Tests added/updated: `web/src/units/collection.test.ts`, `web/src/units/camera.test.ts`, `web/src/ui/screens/Result.test.tsx`.

Test/verify commands (run from repo root): `npm --prefix web test` (80 tests), `npm test` (90 tests), `npm run typecheck`, `npm --prefix web run build`.

## Learnings

- The "Your Backs never saved on iPhone" bug had a WebKit root cause: iOS Safari unreliably stores `Blob` objects in IndexedDB, and `crypto.randomUUID()` is missing before iOS 15.4; both failures were silently swallowed by a bare `catch`.
The fix was to store `ArrayBuffer` bytes, generate ids with `crypto.getRandomValues`, and surface errors.
For the native port this whole class of bug disappears (native storage), but the takeaway carries over: the collection is a device-local library, not server-synced, so the native app needs its own local store.
- The front-camera preview and the captured frame must both mirror or they disagree; mirroring only the preview caused repeated back-and-forth.
The native camera code must apply the same rule (mirror preview and captured image together for the front camera).
- FaceBack is a thin client over the Cloudflare backend.
The Gemini API key lives server-side per account and is revealed only behind an emailed PIN; usage limits are enforced server-side.
The native app should reuse this backend and not reimplement accounts, keys, or limits.
- Tooling gotcha: `gh pr edit` and `gh pr view` fail with a "Projects (classic) is being deprecated" GraphQL error (exit 1) on this repo.
Workaround is the REST API, e.g. `gh api repos/acbecquet/FaceBack/pulls/<n> -X PATCH -f title=... -F body=@file`.
- Deploy is manual and lives with Charlie: the headless hub server has no Cloudflare auth (`wrangler whoami` reports not authenticated, and Charlie does not share tokens with the agent).
Deploy is `npm --prefix web run build` then `npx wrangler pages deploy` (Pages project "faceback"), run from an authenticated machine.

## Artifacts

- This handoff: `docs/handoffs/2026-07-14_18-20-54_general_native-swift-ios-macos-port.md`.
- Web app source (feature complete): `web/` (client) and `functions/` (Cloudflare Pages Functions API).
- Design and implementation history: `docs/superpowers/specs/*` and `docs/superpowers/plans/*`.
- Production infra: `wrangler.toml` (Pages project "faceback", D1 database "faceback", one KV namespace).

## Action Items & Next Steps

1. **Stand up a macOS dev environment (blocking; Charlie has no Mac).**
Recommended path is a cloud Mac rather than a local VM (see Other Notes for options and pricing).
Running macOS in a VM on the Linux hub is against Apple's software license and is technically fragile, so avoid it except as a throwaway experiment.
2. **On the Mac, install the toolchain.**
Install Xcode (from the App Store or the `xcodes` CLI), sign into an Apple ID, install Claude Code, and clone `acbecquet/FaceBack`.
Charlie has said Claude Code setup there should not be a problem.
3. **Resolve scope with Charlie before planning (open questions):**
iPhone-only, or iPhone plus Mac via multiplatform SwiftUI / Mac Catalyst?
Reuse the Cloudflare backend (recommended) or build a native/serverless backend?
Join the Apple Developer Program ($99/yr) now, or start simulator-only and use the free 7-day device provisioning?
4. **Brainstorm -> spec -> plan the port.**
Use the superpowers `brainstorming` skill to turn "port FaceBack to native SwiftUI, reusing the Cloudflare backend" into a design doc, then `writing-plans`, then `subagent-driven-development`.
5. **Map the web app to native components** using the table in Other Notes as the starting point.

## Other Notes

### Backend API contract (what the native client calls)

Base URL is the same Cloudflare Pages origin as the website; all endpoints are under `/api` except the share redeem route `/r`.
Auth is an `HttpOnly` cookie named `fb_session` (HMAC-signed, stateless); the web client sends `credentials: "include"`.
`URLSession` on iOS/macOS uses `HTTPCookieStorage` automatically, so the same cookie flow works natively with no extra work (a bearer-token variant could be added server-side later if preferred - that is a decision, not a requirement).
Bodies are JSON; errors come back as non-2xx with `{ error: { code, message } }`.

- `GET /api/me` -> `PublicAccount` or 401 (treated as signed-out). `PublicAccount = { username, email, hasOwnKey, isDev, usesDevKey }`.
- `POST /api/auth/signup` `{ username, email }` -> `{ pending }`.
- `POST /api/auth/request` `{ identifier }` -> `{ pending }` (emails a login code).
- `POST /api/auth/verify` `{ identifier, code }` -> `{ account }` and sets the `fb_session` cookie.
- `POST /api/auth/logout` -> `{ ok }` (clears the cookie).
- `POST /api/key` `{ apiKey }` -> `{ ok }` (set the initial Gemini key).
- `POST /api/key/challenge` -> `{ pending }` (emails a 6-digit PIN to reveal/edit the key).
- `POST /api/key/reveal` `{ code }` -> `{ apiKey: string | null, editToken }`.
- `PUT /api/key` `{ apiKey, editToken }` -> `{ ok }`.
- `GET /api/dev/allowlist` -> `{ emails }` (dev account only).
- `POST /api/dev/allowlist` `{ email }` -> `{ ok }`; `DELETE /api/dev/allowlist` `{ email }` -> `{ ok }`.
- `POST /api/share` -> `{ url, expiresInSeconds }` (dev only; a 1-hour auto-login link, redeemed at `GET /r?t=<token>` which mints a short-lived session and 302s to `/`).
- `POST /api/generate` `{ image: { base64, mimeType } }` -> `{ base64, mimeType }` (the generated back-of-head). Error codes seen by the client: `daily_limit`, `no_key`, `dev_key_unset`, `unauthorized`.
- `GET /api/health` -> health check.

Server source for these lives under `functions/api/**` with a global error boundary in `functions/_middleware.ts` and the share redeem in `functions/r.ts`.

### Web -> native component mapping (starting point)

- App shell `web/src/App.tsx` -> SwiftUI `App` + `NavigationStack` with the same screen states (loading, SignIn, AddKey, Camera, Generating, Result, Collection, Settings).
- `web/src/ui/screens/Camera.tsx` + `web/src/units/camera.ts` -> AVFoundation (`AVCaptureSession`, `AVCapturePhotoOutput`); mirror the front camera preview and captured image together.
- `web/src/units/faceGate.ts` (face-present gate) -> Vision framework (`VNDetectFaceRectanglesRequest`).
- `web/src/units/generationClient.ts` -> `URLSession` POST to `/api/generate`.
- `web/src/ui/screens/Result.tsx` -> SwiftUI `HStack` showing original and back; Save to Photos via `PHPhotoLibrary` plus a share sheet.
- `web/src/units/collection.ts` (IndexedDB) -> SwiftData or Core Data plus file storage for the image bytes.
- `web/src/ui/screens/Settings.tsx` -> native settings hitting the same `/api/key`, `/api/dev/allowlist`, `/api/share` endpoints (PIN reveal, invites, share link).
- `web/src/units/usageGuard.ts` (localStorage throttle) -> `UserDefaults` (client-side courtesy throttle; the real limits are server-side).
- `web/src/units/apiClient.ts` -> a small `URLSession` client with `HTTPCookieStorage`.
- `web/src/theme.css` tokens -> SwiftUI color/font constants; brand blue is `#1877f2`, background `#f0f2f5`, card `#ffffff`, text `#14171a`, muted `#65676b`, line `#dcdfe4`.

### macOS environment options (for the "no Mac" problem)

- **AWS EC2 Mac** (`mac2.metal`, Apple silicon): full macOS on a dedicated host, roughly $0.65/hr with a 24-hour minimum host allocation (about $15+ minimum per allocation).
Most flexible for real interactive dev plus Claude Code and Xcode. Good default.
- **Scaleway Apple silicon Mac mini**: hourly, EU-based, generally cheaper than AWS; also a 24-hour minimum. Good budget option for real dev.
- **MacStadium**: subscription dedicated/hosted Macs, developer-friendly, better for ongoing use than one-off.
- **MacinCloud**: managed pay-as-you-go or monthly; cheapest for light interactive use, but more locked down (verify it allows installing Node/Claude Code and command-line tooling).
- **GitHub Actions macOS runners**: only for CI builds, not interactive development, so not suitable for a Claude Code session.
- **Local VM on the Linux hub** (OSX-KVM/QEMU): violates Apple's license (macOS may only be virtualized on Apple-branded hardware), and Xcode/simulator performance is poor without GPU passthrough. Not recommended for real work.

Recommendation: AWS EC2 Mac or Scaleway for genuine SwiftUI development with Claude Code; MacinCloud if the budget is tight and usage is light.
Note the Apple Developer Program ($99/yr) is required for TestFlight, running on a physical iPhone beyond the free 7-day provisioning, push notifications, and App Store submission; simulator development is free.
Since Charlie will want to test on his own iPhone, budget for the $99 or start with the free 7-day device provisioning.

### Stopgap option

If the native build stalls, the existing web app can be added to the iPhone home screen as a PWA-style shortcut in the meantime; it already runs full-screen and handles the camera.
This is a fallback, not the goal.

### Standing constraints (carry these into the next session)

- Never push to `main`/`master` without explicit authorization; Charlie has been authorizing each round, and this repo's `.claude/worktrees/phase1` worktree tracks production `main`.
- Never touch or read the Synology Drive (shared SDR resource).
- Do not use the em dash; use a plain dash.
- Never auto-add the agent as a commit co-author.
- Never modify `CHANGELOG.md` or other auto-generated files.
- In long markdown files, put each full sentence on its own line.
- Charlie does not share API keys/tokens with the agent and runs `wrangler` deploys himself from an authenticated machine.

### How to resume in the fresh session

The humanlayer command's finalization steps (`scripts/spec_metadata.sh`, `humanlayer thoughts sync`, `/resume_handoff`) are specific to the humanlayer repo and do not exist here, so they were adapted.
To resume: on the Mac, `git pull` on `main`, then tell Claude Code to read this file (`docs/handoffs/2026-07-14_18-20-54_general_native-swift-ios-macos-port.md`) and start with the superpowers `brainstorming` skill for the native port.
