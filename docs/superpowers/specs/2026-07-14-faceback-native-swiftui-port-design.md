# FaceBack Native (SwiftUI iOS) - Design Specification

- Status: Approved and living. This is the overarching master spec, kept current as the port is built phase by phase (see Section 3.3).
- Date: 2026-07-14.
- Author: Charlie (becquetcharlie@gmail.com) with Claude.
- Relationship: this is the detailed design for "Phase 2" anticipated in `2026-07-07-faceback-design.md`.
- It ports the feature-complete web app (`web/`) to native SwiftUI, reusing the existing Cloudflare backend (`functions/`) unchanged.

## 1. Overview

FaceBack Native is a SwiftUI iPhone app that reproduces the FaceBack web experience one-to-one.
You sign in, a camera opens, you snap or upload a photo, and the app generates a photorealistic image of the back of that head, which you save to your Photos.
The app is a thin client: all accounts, API keys, usage limits, and image generation stay on the existing Cloudflare Pages Functions backend, called over the same `/api` contract the web client uses.

The app is authored entirely on Linux with no Mac.
It is compiled, tested, and shipped through GitHub Actions macOS runners (free for this public repo, Xcode preinstalled) and delivered to a physical iPhone via TestFlight.
An interactive cloud Mac (AWS EC2) is an optional last resort only, not part of the normal loop.

## 2. Guiding principle: identical UX to the web app

The native app must be identical in user experience to the web app, realized in native components rather than a web view.
"Identical" means the same screens, the same screen-flow state machine, the same copy strings, and the same look: the `web/src/theme.css` tokens are ported directly (brand blue `#1877f2`, background `#f0f2f5`, card `#ffffff`, text `#14171a`, muted `#65676b`, line `#dcdfe4`, 12px corner radius), and since the web app already uses the system font stack, iOS renders the same typeface.

A small number of web-isms are replaced by their faithful native equivalent of the same user action, which are translations rather than redesigns:

- Browser download on Save becomes save to the iOS Photos library plus the system share sheet.
- `getUserMedia` becomes AVFoundation capture.
- The hidden file input fallback becomes `PHPickerViewController`.

The single deliberate behavior difference is the face-gate (Section 9).
Because the native gate is "active but forgiving," the common case where a face is present looks identical to the web app; it only diverges when there genuinely is no face.

## 3. Scope: MVP (first TestFlight build) and fast-follows

### 3.1 MVP - the core magic loop

The first TestFlight build that reaches the physical iPhone includes exactly the core loop:

- SignIn (email or username plus emailed 6-digit code; and account creation).
- AddKey (set the initial Gemini key) when the account has no key.
- Camera (capture or upload, with the face-gate).
- Generating (progress screen).
- Result (original and generated back side by side).
- Save to iOS Photos plus share sheet.

### 3.2 Deferred fast-follows

These are out of the MVP but will be ported with equal fidelity afterward:

- The "Your Backs" local gallery (browse, multi-select delete) backed by SwiftData.
- Settings: PIN-protected Gemini-key reveal and edit.
- Dev-only tools: allowlist invites and the 1-hour dev share link.

Deferring these is a phasing decision, not a UX change; the deferred screens match the web app when they land.

### 3.3 Delivery phases and living status

The native port is built in ordered phases.
Each phase is planned in its own `docs/superpowers/plans/` file, executed to green CI, and then this section is updated (status plus any learnings) so this master spec always reflects reality and guides the next phase.
These are the native port's internal build phases; the original `2026-07-07-faceback-design.md` called the whole native app "Phase 2."

| Phase | Plan file | Deliverable | Status |
| --- | --- | --- | --- |
| 1 - Scaffold & CI | `2026-07-15-faceback-native-01-scaffold-ci.md` | `ios/` scaffold, XcodeGen, FaceBackKit skeleton, green two-job CI (the walking skeleton) | Done - green CI |
| 2 - FaceBackKit logic | `2026-07-15-faceback-native-02-kit.md` | models, APIClient, UsageGuard, image math, GenerationFlow; `swift test` green on Linux | Done (23 tests) |
| 3 - App shell & auth | `2026-07-15-faceback-native-03-app-shell-auth.md` | SessionModel, navigation state machine, Theme and components, Loading/SignIn/AddKey | Planned |
| 4 - Camera, generate, result | `2026-07-15-faceback-native-04-camera-generate-result.md` | CameraModel, AVFoundation, Vision face-gate, PHPicker, GenerationModel, Camera/Generating/Result, save-to-Photos | Planned |
| 5 - Delivery to device | `2026-07-15-faceback-native-05-delivery-testflight.md` | fastlane signing, App Store Connect setup, TestFlight upload | Planned |

Plans for phases 2 to 5 are written at the start of their phase, not upfront, so each is informed by the phase before it.

**Per-phase learnings** are recorded here as each phase completes.

#### Phase 1 learnings (2026-07-15, complete)

The walking-skeleton CI is green: `kit-linux` runs `swift test` on `FaceBackKit` in a `swift:5.10` container, and `build-test` on `macos-14` generates the project with XcodeGen and runs `xcodebuild test` on a Simulator; both execute a real test.
Three CI quirks were shaken out and are now baked into `.github/workflows/ios.yml`:

- Select the latest Xcode on the runner (`sudo xcode-select -s` to the newest `Xcode_*.app`): `brew install xcodegen` emits an Xcode 16 project format (`objectVersion 77`) that the runner's default Xcode 15.x cannot open.
- Pick the Simulator by UDID via `xcrun simctl list devices available -j | jq`, not by a hardcoded name (names vary by Xcode version).
- Push-only trigger plus a `concurrency` group avoids duplicate push/pull_request runs while still showing checks on the PR.

Two deliberate choices carried forward: the app's test target is a minimal unit-test target (`FaceBackTests`), with XCUITest and screenshot capture deferred to a phase that has real screens to drive; and the Info.plist is generated by XcodeGen's `info:` block and not committed.
Phase 2 builds `FaceBackKit` on top of the proven Linux `swift test` loop.

#### Phase 2 learnings (2026-07-15, complete)

`FaceBackKit` is complete and green: 23 tests pass on Linux (models, `APIError`, `APIClient`, `UsageGuard`, `ImageMath`, `GenerationFlow`), and the package still compiles for iOS in the macOS job.
Learnings for future Kit work:

- Networking types require `#if canImport(FoundationNetworking) import FoundationNetworking #endif` - on Linux `URLSession`/`URLRequest`/`HTTPURLResponse` live in `FoundationNetworking`, not `Foundation`.
- Use `session.dataTask` wrapped in `withCheckedThrowingContinuation` rather than the async `data(for:)` for portability.
- Test the network layer by injecting a fake `HTTPTransport`, not by mocking `URLProtocol` (unreliable in swift-corelibs-foundation on Linux). `HTTPTransport` is also the seam the app wires to a real cookie-carrying `URLSession` in Phase 3.

`GenerationFlow` runs against injected closures (`inputHasFace`/`downscale`/`generate`/`outputHasFace`); Phase 4 supplies the Vision/CoreGraphics/`APIClient` implementations, with the forgiving degrade-open living in the app's `inputHasFace` closure.

## 4. Architecture and module layout

Architecture is vanilla SwiftUI with `@Observable` state objects (the modern "MV" pattern), no third-party app framework.
The logic layer that can be platform-free is isolated into a local Swift package so it compiles and tests on Linux.

```
ios/
  project.yml                 XcodeGen project definition (generates the .xcodeproj on the runner)
  FaceBack/                   app target (SwiftUI, iOS 17 deployment target)
    FaceBackApp.swift         @main App; owns root state
    Models/                   @Observable: SessionModel, CameraModel, GenerationModel
    Screens/                  SignInView, AddKeyView, CameraView, GeneratingView, ResultView, LoadingView
    Components/               FBButton, FBTextField, Wordmark, Icons
    Theme.swift               color and type tokens ported from theme.css
    Info.plist                NSCameraUsageDescription, NSPhotoLibraryAddUsageDescription
  FaceBackKit/                local SwiftPM package - platform-free, Linux-testable
    Sources/FaceBackKit/      APIClient, Codable models, UsageGuard, image-scale math, GenerationFlow
    Tests/FaceBackKitTests/   XCTest (mocked URLProtocol, fake flow deps)
  FaceBackUITests/            XCUITest (core journey plus screenshots)
  fastlane/                   Fastfile: test lane and TestFlight lane
.github/workflows/ios.yml     CI
```

`FaceBackKit` holds everything that does not require Apple UI or device frameworks: the API client (Foundation `URLSession` exists on Linux), the Codable models, the usage throttle, the image-scaling math, and the generation orchestration written against injected protocols (mirroring the web app's `ui/flow.ts` plus `App.makeDeps`).
The app target supplies the concrete Vision, AVFoundation, CoreGraphics, SwiftUI, and storage implementations and wires them into the flow.
This split is what enables a fast, free `swift test` feedback loop on Linux before CI runs.

## 5. Navigation and screen state machine

Navigation is a state-driven switch that mirrors the web app's render precedence in `web/src/App.tsx` (first match wins), not a `NavigationStack`.

Account state is `enum AccountState { case loading; case signedOut; case signedIn(PublicAccount) }`.
Generation phase is `enum Phase { case idle; case generating; case result(GenResult) }`.

Render precedence:

1. Account loading -> `LoadingView` (spinner).
2. Signed out -> `SignInView`.
3. Signed in and `!hasOwnKey && !usesDevKey` -> `AddKeyView`.
4. Phase is generating -> `GeneratingView`.
5. Phase is result -> `ResultView`.
6. Otherwise -> `CameraView`.

Transitions port one-to-one from the web app:

- Capture -> phase generating -> run the pipeline -> phase result (or back to idle plus an error).
- Retry and Discard on Result -> phase idle, back to Camera (revoking the previous result).
- A `unauthorized` error mid-session -> account signedOut (bounce to SignIn).
- A `no_key` or `dev_key_unset` error -> refresh account (routes a keyless user to AddKey).

There is no tab bar in the MVP because the gallery is deferred.

## 6. Screens (MVP)

Each screen reproduces the corresponding web screen's elements, copy, and interactions.

- LoadingView: centered spinner shown while `GET /api/me` is in flight on cold launch.
- SignInView: two modes, sign-in and create. Sign-in takes one "Email or username" field, requests an emailed 6-digit code, then verifies. Create takes username plus email (validated to contain "@"), signs up, then verifies. A text button toggles modes. Code entry is digit-filtered to 6.
- AddKeyView: one secure field for the Gemini key with a show/hide eye toggle, Save sets the initial key, then routes onward.
- CameraView: top bar with the wordmark and no settings gear in the MVP (the gear returns with the deferred Settings screen); a live preview (front camera mirrored); a hint line; bottom controls with an upload-photo button, a round shutter, and a switch-camera button. Default camera is the back camera, matching the web app.
- GeneratingView: static progress screen with "Generating the back of your head..." and the "usually about 5-10 seconds" subtitle.
- ResultView: original (left, caption "Original") and generated back (right, caption "Back") in a two-column layout, with Save, Retry, and Discard, and the "It's just the back of their head." header.

Shared components port the web app's `Button`, `TextField`, `Wordmark`, and the inline SVG icon set to native equivalents.

## 7. Networking and auth (APIClient plus cookie session)

`APIClient` lives in `FaceBackKit` and exposes a generic `call<T: Decodable>(_ path: String, method:, body:)` that prepends the Cloudflare Pages origin, sends and decodes JSON, and throws `APIError(code, message)` parsed from the `{ error: { code, message } }` body on any non-2xx.

Auth reuses the web app's stateless cookie flow with no token handling.
`URLSession` with the shared `HTTPCookieStorage` automatically stores and resends the `fb_session` HttpOnly cookie, exactly reproducing the web client's `credentials: "include"`.

MVP endpoints:

- `GET /api/me` -> `PublicAccount` or nil on 401.
- `POST /api/auth/signup { username, email }`.
- `POST /api/auth/request { identifier }` (emails a code).
- `POST /api/auth/verify { identifier, code }` -> `{ account }` and sets the cookie.
- `POST /api/auth/logout`.
- `POST /api/key { apiKey }` (set the initial key).
- `POST /api/generate { image: { base64, mimeType } }` -> `{ base64, mimeType }`.

`PublicAccount = { username, email, hasOwnKey, isDev, usesDevKey }`.

To keep the user signed in across app launches, the `fb_session` cookie must carry an `Expires` or `Max-Age` (persistent cookies survive relaunch; pure session cookies do not).
If it turns out to be session-only, the app adds a small Keychain-backed cookie persistence layer that saves and restores the cookie around launches (see Open Questions).

## 8. Generation pipeline (GenerationFlow)

`GenerationFlow` in `FaceBackKit` ports `web/src/ui/flow.ts` `runGeneration`, driven by injected dependencies so it is fully unit-testable on Linux.

Steps:

1. Throttle: `UsageGuard.decide(now, history)` blocks within the 3s minimum interval, throwing `too_soon`.
2. Input face-gate: detect a face in the captured image; throw `no_face` if none (subject to the forgiving rule in Section 9).
3. Downscale: longest edge to 1024, JPEG quality 0.9, encoded to `{ base64, mimeType }`.
4. Generate: `POST /api/generate`.
5. Output check plus regenerate-once: if the generated image still contains a detectable face, regenerate exactly once and accept whatever returns.
6. Record usage: `UsageGuard.record(now)`.

The daily cap is enforced server-side (`daily_limit`); the client throttle is only the courtesy 3s minimum, persisted in `UserDefaults` and pruned past 24h.

## 9. Camera and Vision face-gate

Capture uses AVFoundation: an `AVCaptureSession` with an `AVCaptureVideoPreviewLayer` wrapped in a `UIViewRepresentable`, and an `AVCapturePhotoOutput`.
The chosen camera is remembered across the Camera view's remounts, defaulting to the back camera as the web app does.

The web app's hard-won mirroring rule is preserved: the front-camera preview and the captured frame are both mirrored, together, so what you frame is what you get; the back camera is not mirrored.
When the camera is unavailable, the app falls back to `PHPickerViewController`, reproducing the web app's upload fallback and its "Camera unavailable. You can upload a photo instead." copy.

Face detection uses the Vision framework (`VNDetectFaceRectanglesRequest`), which, unlike the web app's `FaceDetector` (absent in iOS Safari, so inert there), actually runs.
The gate is "active but forgiving":

- Input: block capture only when Vision confidently returns zero faces, with the "no face" copy; if Vision errors, degrade open and allow (matching the web app's fail-open posture).
- Output: run the regenerate-once loop when a face is still detected in the result.

This lifts output quality and avoids spending a generation on a faceless frame, while the forgiving posture keeps the common case identical to the web experience.

## 10. Save (MVP)

Save writes the generated image to the iOS Photos library via `PHPhotoLibrary` (requiring `NSPhotoLibraryAddUsageDescription`) and offers the system share sheet (`UIActivityViewController`), then returns to the Camera.
This is the native equivalent of the web app's save-to-collection plus browser-download, minus the in-app collection, which is deferred with the gallery.

## 11. Local storage (deferred gallery)

The MVP has no local database; the only client persistence is the session cookie (via `HTTPCookieStorage`, plus Keychain if needed) and the courtesy throttle (`UserDefaults`).
The deferred "Your Backs" gallery will use SwiftData (available at the iOS 17 target) with image bytes stored as `Data`, which sidesteps the WebKit IndexedDB/Blob bug entirely; the collection remains a device-local library, not server-synced.

## 12. Error handling

The web app's `messageFor(e)` copy map is reproduced verbatim so error text is identical: `too_soon`, `no_face`, `daily_limit`, `no_key` and `dev_key_unset` (route the keyless user to AddKey), otherwise the server message.
Errors are shown in the same red banner above the Camera.
A `unauthorized` result mid-session clears the account and bounces to SignIn.

## 13. Build, CI, signing, and TestFlight delivery

CI runs on GitHub Actions `macos-14` runners (Xcode preinstalled), free for this public repository.

- Every push and PR: `xcodegen generate`, then `xcodebuild build` and `xcodebuild test` against an iOS Simulator destination (unit and UI tests), then upload screenshot artifacts; plus `swift test` on the `FaceBackKit` package for a fast logic check.
- On demand (a tag or the main branch): a fastlane lane builds and signs the app with cloud-managed certificates and uploads to TestFlight, authenticating with an App Store Connect API key.

Project generation is XcodeGen, so there is no binary `.xcodeproj` to hand-edit on Linux.
The physical-iPhone install is over-the-air through the TestFlight app; Charlie is added as an internal tester.

## 14. Testing strategy

Testing mirrors the web app's suite and runs without any real backend calls.

- `FaceBackKit` unit tests (Linux and runner): `APIClient` against a mocked `URLProtocol` (success, each error code, 401), `UsageGuard` throttle, image-scale math, and `GenerationFlow` with fake deps covering `too_soon`, `no_face`, regenerate-once, and the happy path.
- XCUITest (Simulator): the core journey from sign-in through capture, generating, result, and save, driven with an injected test image and stubbed network, capturing screenshots as CI artifacts so the UI can be verified from Linux.
- Every push is gated through the `no-mistakes` pipeline (Claude Opus 4.8, max thinking) plus SwiftLint.

## 15. Secrets and one-time setup

These are the only human-in-the-loop steps, all one-time.

- Enroll in the Apple Developer Program ($99/yr); this has 1-2 day lead time and gates all device delivery.
- Create the App ID and the App Store Connect app record for the bundle identifier.
- Generate an App Store Connect API key (`.p8`) and add it, with the key ID and issuer ID, to GitHub Actions secrets, along with any fastlane signing secrets.

After these, CI signs and ships to TestFlight autonomously.

## 16. Web-to-native mapping

| Web (`web/src/...`) | Native |
| --- | --- |
| `App.tsx` state machine | root `@Observable` state plus a SwiftUI switch |
| `ui/flow.ts runGeneration` | `FaceBackKit.GenerationFlow` (injected deps) |
| `units/apiClient.ts` | `FaceBackKit.APIClient` (`URLSession` plus `HTTPCookieStorage`) |
| `units/generationClient.ts` | `APIClient.generate` |
| `units/camera.ts`, `ui/screens/Camera.tsx` | AVFoundation capture plus preview (mirror front) |
| `units/faceGate.ts` | Vision `VNDetectFaceRectanglesRequest` |
| `units/usageGuard.ts` | `UsageGuard` plus `UserDefaults` |
| `units/imageUtil.ts` | image-scale math (Kit) plus CoreGraphics downscale (app) |
| `units/export.ts` | `PHPhotoLibrary` save plus share sheet |
| `units/collection.ts` (deferred) | SwiftData plus `Data` bytes |
| `ui/screens/*` | `Screens/*View.swift` |
| `theme.css` | `Theme.swift` |

## 17. Open questions / to verify during implementation

- Confirm whether `fb_session` carries an `Expires`/`Max-Age`; if session-only, implement the Keychain-backed cookie persistence described in Section 7.
- Confirm the CORS/origin configuration allows the native app's requests (the backend serves the web app from the same origin; native requests carry no `Origin` header, which is typically fine, but verify).
- Confirm the exact fastlane signing approach (App Store Connect API automatic cloud signing vs `match`) once the Developer Program account exists.

## 18. Non-goals (MVP)

- No in-app gallery, Settings, PIN key reveal, or dev tools (deferred fast-follows).
- No offline generation or on-device model; generation stays server-side.
- No new backend endpoints; the native app reuses the existing `/api` contract unchanged.
- No interactive Mac in the normal build loop.
