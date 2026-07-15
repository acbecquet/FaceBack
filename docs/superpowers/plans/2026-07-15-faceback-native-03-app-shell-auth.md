# FaceBack Native 03 - App Shell & Auth - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SwiftUI app shell and the sign-in flow: an `@Observable` `SessionModel` driving the root navigation state machine, the ported theme and shared components, and the Loading / SignIn / AddKey screens - a faithful 1:1 port of the web screens, green on the macOS `build-test` job.

**Architecture:** Vanilla SwiftUI. A main-actor `@Observable SessionModel` wraps `FaceBackKit.FaceBackAPI` and holds an `AccountState` enum; `RootView` switches on it exactly as `web/src/App.tsx` does. The app wires a cookie-carrying `URLSession` into `URLSessionTransport` so `fb_session` persists like the web client. `SessionModel` is unit-tested against a fake `FaceBackAPI` in the app test target.

**Tech Stack:** SwiftUI, Observation (`@Observable`, iOS 17), FaceBackKit, XCTest.

## Global Constraints

- App-target code (SwiftUI) compiles only on the macOS runner; validate via the `build-test` job, not `kit-linux`.
- Identical UX to the web app. Ported design tokens (from `web/src/theme.css`):
  - blue `#1877F2`, blueDark `#0B5FCE`, bg `#F0F2F5`, card `#FFFFFF`, text `#14171A`, muted `#65676B`, line `#DCDFE4`, radius `12`, errorRed `#C0271B`.
  - Buttons: full width, padding 12, radius 12, blue/white, weight ~semibold, size 15; disabled opacity 0.5; secondary is card bg + line border.
  - Fields: label size 12 weight 600 muted; input padding 11/12, line border, radius 12, card bg, size 15; 12pt bottom margin.
  - Wordmark: heavy weight, tracking -0.03em, blue.
  - The app forces light appearance (`.preferredColorScheme(.light)`) since the web is light-only.
- Verbatim copy (do not paraphrase):
  - SignIn subtitle: `See the side of you that you never see.`
  - SignIn toggle: `New here? Create an account` / `Already have an account? Sign in`
  - SignIn buttons: `Send code` / `Sending...`; `Verify` / `Verifying...`
  - SignIn fields: `Email or username`; `Username`; `Email`; `Verification code` (placeholder `6-digit code`, numeric, max 6)
  - SignIn error (sign-in request + `no_account`): `No account with that email or username.`; otherwise the server message; non-API error `Something went wrong. Try again.`
  - AddKey subtitle: `Add your Nano Banana 2 / Gemini key to start generating.`
  - AddKey field: `Nano Banana 2 key` (secure, eye toggle); button `Save key` / `Saving...`
- Validation rules (from SignIn.tsx): identifier non-empty; create = username non-empty AND email contains `@`; code length == 6 (digits only).
- No em dashes; never auto-add an agent commit co-author.

## File layout

```
ios/FaceBack/
  FaceBackApp.swift            (modify: build SessionModel, RootView root, .task refresh, light scheme)
  AppConfig.swift              (baseURL of the deployed backend)
  Theme.swift                  (Color tokens + Color(hex:))
  Session/
    SessionModel.swift         (@Observable @MainActor; AccountState; api actions)
    CookieSession.swift        (URLSession.fbSession with shared cookie storage)
  Components/
    Wordmark.swift  FBButton.swift  FBTextField.swift  EyeButton.swift
  Screens/
    LoadingView.swift          (modify: blue spinner on bg)
    SignInView.swift  AddKeyView.swift  CameraPlaceholderView.swift
  RootView.swift               (the navigation switch)
ios/FaceBackTests/
  SessionModelTests.swift      (+ FakeAPI)
```

## Public contract (Phase 4 consumes)

```swift
@MainActor @Observable
final class SessionModel {
    enum AccountState: Equatable { case loading; case signedOut; case signedIn(PublicAccount) }
    private(set) var account: AccountState
    var needsKey: Bool                       // signedIn && !hasOwnKey && !usesDevKey
    init(api: FaceBackAPI)
    func refresh() async                     // me() -> signedIn/signedOut
    func requestSignInCode(identifier: String) async throws
    func signUp(username: String, email: String) async throws
    func verify(identifier: String, code: String) async throws   // sets signedIn on success
    func setKey(_ apiKey: String) async throws                    // then refresh()
    func signOut() async
}
```

---

### Task 1: Theme + shared components

**Files:** Create `Theme.swift`, `Components/Wordmark.swift`, `Components/FBButton.swift`, `Components/FBTextField.swift`, `Components/EyeButton.swift`.

`Theme.swift`:
```swift
import SwiftUI

enum Theme {
    static let blue     = Color(hex: 0x1877F2)
    static let blueDark = Color(hex: 0x0B5FCE)
    static let bg       = Color(hex: 0xF0F2F5)
    static let card     = Color(hex: 0xFFFFFF)
    static let text     = Color(hex: 0x14171A)
    static let muted    = Color(hex: 0x65676B)
    static let line     = Color(hex: 0xDCDFE4)
    static let errorRed = Color(hex: 0xC0271B)
    static let radius: CGFloat = 12
}

extension Color {
    init(hex: UInt) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}
```

`FBButton.swift`: a full-width button, `primary`/`secondary`, `title`, `disabled`, `action`. Text weight `.semibold`, size 15, padding 12, `RoundedRectangle(cornerRadius: Theme.radius)`, primary blue/white, secondary card + `Theme.line` stroke, `.opacity(disabled ? 0.5 : 1)`, `.disabled(disabled)`.

`FBTextField.swift`: label (size 12, `.semibold`, muted) above an input row (padding 11/12, card bg, `Theme.line` stroke, radius) with an optional `trailing: AnyView?`; `secure` toggles `SecureField`/`TextField`; `keyboard: UIKeyboardType`. 12pt bottom padding.

`Wordmark.swift`: `Text("FaceBack").font(.system(size: size, weight: .heavy)).tracking(-0.03 * size).foregroundStyle(Theme.blue)`.

`EyeButton.swift`: an SF Symbol eye toggle (`Image(systemName: on ? "eye.slash" : "eye")`) in `Theme.muted`, used as the AddKey field trailing.

- [ ] Implement the above. - [ ] Validate via `build-test`. - [ ] Commit `feat(app): theme tokens and shared components`.

### Task 2: SessionModel, cookie session, config, tests

**Files:** Create `AppConfig.swift`, `Session/CookieSession.swift`, `Session/SessionModel.swift`; `FaceBackTests/SessionModelTests.swift`.

`AppConfig.swift`: `enum AppConfig { static let baseURL = URL(string: "https://faceback.pages.dev/api")! }` (confirm against the deployed origin before Phase 4 device testing).

`CookieSession.swift`:
```swift
import Foundation
extension URLSession {
    static let fbSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        return URLSession(configuration: config)
    }()
}
```

`SessionModel.swift` implements the contract above:
```swift
func refresh() async { account = await api.me().map(AccountState.signedIn) ?? .signedOut }
func verify(identifier: String, code: String) async throws {
    account = .signedIn(try await api.verify(identifier: identifier, code: code))
}
func setKey(_ apiKey: String) async throws { try await api.setInitialKey(apiKey); await refresh() }
func signOut() async { try? await api.logout(); account = .signedOut }
```
`needsKey`: `if case .signedIn(let a) = account { return !a.hasOwnKey && !a.usesDevKey } else { return false }`.

Tests use a `FakeAPI: FaceBackAPI` with settable `meResult`, `verifyResult`, and error toggles. Cover: `refresh` -> signedIn when `me` returns an account, signedOut when nil; `verify` sets `.signedIn`; `needsKey` true for `hasOwnKey=false,usesDevKey=false` and false when either is true; `setKey` calls `me` again; `signOut` -> signedOut. Mark the test class `@MainActor`.

- [ ] Implement + tests. - [ ] Validate via `build-test` (runs the app unit tests). - [ ] Commit `feat(app): SessionModel with cookie session and unit tests`.

### Task 3: Root navigation + app wiring + Loading/Camera placeholder

**Files:** Modify `FaceBackApp.swift`, `Screens/LoadingView.swift`; create `RootView.swift`, `Screens/CameraPlaceholderView.swift`.

`RootView` switches on `session.account`: `.loading` -> `LoadingView`; `.signedOut` -> `SignInView(session:)`; `.signedIn` -> `session.needsKey ? AddKeyView(session:) : CameraPlaceholderView()`. `FaceBackApp` holds `@State private var session = SessionModel(api: APIClient(baseURL: AppConfig.baseURL, session: .fbSession))`, roots `RootView(session: session)`, `.task { await session.refresh() }`, `.preferredColorScheme(.light)`. `LoadingView` becomes a centered `ProgressView().tint(Theme.blue)` on `Theme.bg`. `CameraPlaceholderView` is a temporary "Signed in - camera arrives in Phase 4" stub on `Theme.bg` (replaced in Phase 4).

- [ ] Implement. - [ ] Validate via `build-test`. - [ ] Commit `feat(app): root navigation state machine and app wiring`.

### Task 4: SignInView

**Files:** Create `Screens/SignInView.swift`.

Faithful port of `web/src/ui/screens/SignIn.tsx`: `@State` for `mode` (`signin`/`create`), `identifier`, `username`, `email`, `code`, `sent`, `busy`, `error`. Wordmark(size:30) + subtitle; the mode-appropriate fields; the code field once `sent`; the red error line; the primary button (Send code -> Verify); the mode-toggle text button. Actions call `session.requestSignInCode` / `session.signUp` then set `sent`, and `session.verify` on submit (which flips the account and unmounts this screen). Digits-only 6-char code filter. `describeError(_:isSignInRequest:)` as specified in Global Constraints.

- [ ] Implement. - [ ] Validate via `build-test`. - [ ] Commit `feat(app): SignIn screen`.

### Task 5: AddKeyView

**Files:** Create `Screens/AddKeyView.swift`.

Faithful port of `web/src/ui/screens/AddKey.tsx`: Wordmark + subtitle; a secure `FBTextField("Nano Banana 2 key")` with an `EyeButton` trailing; red error line; `Save key` / `Saving...` button. On save call `session.setKey(apiKey.trimmed)` (which refreshes and routes past AddKey); on `APIError` show `.message`, else `Something went wrong. Try again.`.

- [ ] Implement. - [ ] Validate via `build-test`. - [ ] Commit `feat(app): AddKey screen`.

---

## Self-Review

- **Spec coverage:** Implements spec Section 5 (navigation state machine), Section 6 (LoadingView, SignInView, AddKeyView, plus the shared components and theme), and Section 7's cookie wiring (`URLSession.fbSession` -> `URLSessionTransport`). Camera/Generating/Result are Phase 4 (placeholder here); Settings is deferred.
- **Placeholder scan:** `AppConfig.baseURL` is a concrete value flagged for confirmation, not a TODO. `CameraPlaceholderView` is an intentional, labeled Phase-4 stand-in.
- **Type consistency:** `SessionModel.AccountState` mirrors the spec enum; `RootView` reads `account`/`needsKey`; screens take `session: SessionModel`; all API calls go through `FaceBackKit.FaceBackAPI`, matching Phase 2 signatures (`me`/`verify`/`requestCode`/`signup`/`setInitialKey`).

**Deliverable:** a signed-out launch shows SignIn, a keyless account shows AddKey, and a keyed account reaches the camera placeholder - all on the ported design system, with `SessionModel` unit-tested, green on `build-test`.
