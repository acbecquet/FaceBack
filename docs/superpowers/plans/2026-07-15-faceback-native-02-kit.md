# FaceBack Native 02 - FaceBackKit Logic - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the platform-free logic layer of FaceBack in `FaceBackKit` - Codable models, the `APIClient` with its error mapping, `UsageGuard`, image-scale math, and the `GenerationFlow` orchestration - all covered by `swift test` that runs green on Linux CI.

**Architecture:** Everything here is pure Swift + Foundation, no Apple UI or device frameworks, so it builds and tests on the `swift:5.10` Linux runner. `APIClient` talks to the existing Cloudflare backend over `URLSession`; `GenerationFlow` orchestrates the capture-to-result pipeline against injected closures so the app can plug in Vision/AVFoundation/CoreGraphics in Phase 4. This is a faithful port of `web/src/units/apiClient.ts`, `generationClient.ts`, `usageGuard.ts`, `imageUtil.ts`, and `ui/flow.ts`.

**Tech Stack:** Swift 5.9, Foundation (`URLSession`, `JSONDecoder`/`Encoder`), XCTest, `URLProtocol` mocking.

## Global Constraints

- Everything lives in `ios/FaceBackKit/Sources/FaceBackKit/` with tests in `ios/FaceBackKit/Tests/FaceBackKitTests/`.
- No imports of SwiftUI, UIKit, AVFoundation, Vision, or CoreGraphics anywhere in this package - it must compile on Linux.
- No real network in tests: every `APIClient` test uses `MockURLProtocol`.
- Validation is via the `kit-linux` CI job (`swift test`), since there is no local Swift toolchain; push and watch that job.
- Backend contract (verbatim from the web client):
  - Base path join is string concatenation `baseURL + path` (e.g. base `https://<origin>/api` + `/me`).
  - Requests send `Content-Type: application/json`; the session carries the `fb_session` cookie automatically.
  - Non-2xx responses carry `{ "error": { "code": string, "message": string } }`; on parse failure use code `request_failed`, message `Request failed (<status>)`.
  - Endpoints and shapes used in this phase:
    - `GET /me` -> `PublicAccount`; a thrown `APIError` (e.g. 401) maps to `nil`.
    - `POST /auth/signup` `{username,email}` -> `{pending}`.
    - `POST /auth/request` `{identifier}` -> `{pending}`.
    - `POST /auth/verify` `{identifier,code}` -> `{account: PublicAccount}`.
    - `POST /auth/logout` -> `{ok}`.
    - `POST /key` `{apiKey}` -> `{ok}`.
    - `POST /generate` `{image:{base64,mimeType}}` -> `{image:{base64,mimeType}}` (return the inner `image`).
  - Deferred to later phases (Settings/dev): `key/challenge`, `key/reveal`, `PUT /key`, `dev/allowlist`, `share`.
- Client throttle: min interval 3s (`MIN_GENERATION_INTERVAL_MS = 3000`); prune usage history older than 24h. Server enforces the real daily cap.
- Image downscale target: longest edge 1024.
- No em dashes; never auto-add an agent commit co-author.

## Public contract (what Phase 3+ consume)

```swift
// Models.swift
public struct PublicAccount: Codable, Equatable, Sendable {
    public let username: String
    public let email: String
    public let hasOwnKey: Bool
    public let isDev: Bool
    public let usesDevKey: Bool
    public init(username: String, email: String, hasOwnKey: Bool, isDev: Bool, usesDevKey: Bool)
}
public struct ImagePayload: Codable, Equatable, Sendable {
    public let base64: String
    public let mimeType: String
    public init(base64: String, mimeType: String)
}

// APIError.swift
public struct APIError: Error, Equatable, Sendable {
    public let code: String
    public let message: String
    public init(code: String, message: String)
}

// APIClient.swift
public protocol FaceBackAPI: Sendable {
    func me() async -> PublicAccount?
    func signup(username: String, email: String) async throws
    func requestCode(identifier: String) async throws
    func verify(identifier: String, code: String) async throws -> PublicAccount
    func logout() async throws
    func setInitialKey(_ apiKey: String) async throws
    func generate(_ image: ImagePayload) async throws -> ImagePayload
}
public final class APIClient: FaceBackAPI {
    public init(baseURL: URL, session: URLSession = .shared)
}

// UsageGuard.swift
public enum UsageGuard {
    public static let minInterval: TimeInterval   // 3
    public enum Decision: Equatable { case allowed; case blocked(reason: String) }
    public static func decide(now: Date, history: [Date]) -> Decision
    public static func record(now: Date, history: [Date]) -> [Date]
}

// ImageMath.swift
public enum ImageMath {
    public static let maxEdge: Int  // 1024
    public static func scaledSize(width: Int, height: Int, maxEdge: Int) -> (width: Int, height: Int)
}

// GenerationFlow.swift
public struct GenerationDeps {
    public var now: () -> Date
    public var loadHistory: () -> [Date]
    public var saveHistory: ([Date]) -> Void
    public var inputHasFace: () async -> Bool
    public var downscale: () async throws -> ImagePayload
    public var generate: (ImagePayload) async throws -> ImagePayload
    public var outputHasFace: (ImagePayload) async -> Bool
    public init(...)
}
public enum GenerationFlow {
    public enum FlowError: Error, Equatable { case tooSoon; case noFace }
    public static func run(_ deps: GenerationDeps) async throws -> ImagePayload
}
```

---

### Task 1: Models (PublicAccount, ImagePayload)

**Files:**
- Create: `ios/FaceBackKit/Sources/FaceBackKit/Models.swift`
- Test: `ios/FaceBackKit/Tests/FaceBackKitTests/ModelsTests.swift`

**Interfaces:**
- Produces: `PublicAccount`, `ImagePayload` (see contract).

- [ ] **Step 1: Tests** - decode a `PublicAccount` from server JSON (`{"username":"a","email":"a@b.c","hasOwnKey":true,"isDev":false,"usesDevKey":false}`) and assert fields; round-trip `ImagePayload` through encode+decode and assert equality.
- [ ] **Step 2: Implement** the two structs exactly as in the contract, with explicit public memberwise inits (needed because a struct's synthesized init is internal).
- [ ] **Step 3: Validate** via CI `kit-linux`.
- [ ] **Step 4: Commit** `feat(kit): PublicAccount and ImagePayload models`.

---

### Task 2: APIError and server error decoding

**Files:**
- Create: `ios/FaceBackKit/Sources/FaceBackKit/APIError.swift`
- Test: `ios/FaceBackKit/Tests/FaceBackKitTests/APIErrorTests.swift`

**Interfaces:**
- Produces: `APIError`; internal `ServerErrorEnvelope { struct Body { code; message }; error: Body }` (Decodable) for parsing `{error:{code,message}}`.

- [ ] **Step 1: Tests** - decode `ServerErrorEnvelope` from `{"error":{"code":"daily_limit","message":"Come back tomorrow"}}` and assert `.error.code`/`.error.message`; assert `APIError` Equatable.
- [ ] **Step 2: Implement** `APIError` and the internal `ServerErrorEnvelope`.
- [ ] **Step 3: Validate** via CI. **Step 4: Commit** `feat(kit): APIError and server error envelope`.

---

### Task 3: APIClient with an injectable HTTP transport

> As-built refinement: the HTTP call is abstracted behind an `HTTPTransport` protocol and tests inject a `FakeTransport`, rather than the `MockURLProtocol` sketched below. `URLProtocol` interception is unreliable in swift-corelibs-foundation on Linux, and dependency injection is both portable and cleaner. The real `URLSessionTransport` wraps `dataTask` in a `withCheckedThrowingContinuation` (portable to Linux, sidesteps the `data(for:)` availability question) and uses the `#if canImport(FoundationNetworking)` import. Endpoint shapes and the test cases below are unchanged; `FakeTransport` receives the built `URLRequest`, so tests can also assert method and path.

**Files:**
- Create: `ios/FaceBackKit/Sources/FaceBackKit/APIClient.swift`
- Create: `ios/FaceBackKit/Tests/FaceBackKitTests/Support/MockURLProtocol.swift`
- Test: `ios/FaceBackKit/Tests/FaceBackKitTests/APIClientTests.swift`

**Interfaces:**
- Consumes: `PublicAccount`, `ImagePayload`, `APIError`, `ServerErrorEnvelope`.
- Produces: `FaceBackAPI`, `APIClient`.

**Key implementation - the private request core:**

```swift
private func perform(_ path: String, method: String, body: Data?) async throws -> Data {
    guard let url = URL(string: baseURL.absoluteString + path) else {
        throw APIError(code: "bad_url", message: "Invalid URL for \(path)")
    }
    var req = URLRequest(url: url)
    req.httpMethod = method
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = body
    let (data, response) = try await session.data(for: req)
    guard let http = response as? HTTPURLResponse else {
        throw APIError(code: "no_response", message: "No HTTP response")
    }
    guard (200..<300).contains(http.statusCode) else {
        if let env = try? JSONDecoder().decode(ServerErrorEnvelope.self, from: data) {
            throw APIError(code: env.error.code, message: env.error.message)
        }
        throw APIError(code: "request_failed", message: "Request failed (\(http.statusCode))")
    }
    return data
}
```

Public methods encode their body with `JSONEncoder` (bodies: `["username":..,"email":..]` etc. as small Encodable structs), call `perform`, and decode: `me()` decodes `PublicAccount` and returns `nil` if `perform`/decoding throws `APIError`; `verify` decodes `struct { account: PublicAccount }` and returns `.account`; `generate` decodes `struct { image: ImagePayload }` and returns `.image`; `signup`/`requestCode`/`logout`/`setInitialKey` ignore the body (throw only on non-2xx).

**MockURLProtocol** (test support):

```swift
import Foundation
final class MockURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let handler = MockURLProtocol.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
```

Test helper builds a session: `let cfg = URLSessionConfiguration.ephemeral; cfg.protocolClasses = [MockURLProtocol.self]; let session = URLSession(configuration: cfg)`, and `APIClient(baseURL: URL(string: "https://test.local/api")!, session: session)`. Each test sets `MockURLProtocol.handler` to return a canned `(HTTPURLResponse(statusCode:), Data)`. Assert on `request.url!.path` and `request.httpMethod` (do NOT assert on `httpBody` - URLProtocol strips it).

- [ ] **Step 1: Tests** covering:
  - `me()` returns the decoded account on 200; returns `nil` on 401 with an error envelope.
  - `verify()` returns `.account` from `{"account":{...}}` on 200.
  - `generate()` returns the inner image from `{"image":{"base64":"AA","mimeType":"image/jpeg"}}` on 200; and posts to path `/api/generate` with method `POST`.
  - error mapping: a 429 with `{"error":{"code":"daily_limit","message":"m"}}` makes `generate()` throw `APIError(code:"daily_limit")`; a 500 with a non-JSON body throws `APIError(code:"request_failed")`.
  - `logout()` and `setInitialKey()` do not throw on a 200 `{"ok":true}`.
- [ ] **Step 2: Implement** `MockURLProtocol`, then `APIClient`.
- [ ] **Step 3: Validate** via CI. **Step 4: Commit** `feat(kit): APIClient with URLProtocol-mocked tests`.

---

### Task 4: UsageGuard

**Files:**
- Create: `ios/FaceBackKit/Sources/FaceBackKit/UsageGuard.swift`
- Test: `ios/FaceBackKit/Tests/FaceBackKitTests/UsageGuardTests.swift`

**Implementation:**

```swift
public enum UsageGuard {
    public static let minInterval: TimeInterval = 3
    public enum Decision: Equatable { case allowed; case blocked(reason: String) }
    public static func decide(now: Date, history: [Date]) -> Decision {
        if let last = history.max(), now.timeIntervalSince(last) < minInterval {
            return .blocked(reason: "too_soon")
        }
        return .allowed
    }
    public static func record(now: Date, history: [Date]) -> [Date] {
        let cutoff = now.addingTimeInterval(-24 * 60 * 60)
        return (history + [now]).filter { $0 >= cutoff }
    }
}
```

- [ ] **Step 1: Tests** - `decide` returns `.blocked("too_soon")` when the last entry is 1s before `now`, `.allowed` when 4s before or when history is empty; `record` appends `now` and drops an entry 25h old while keeping one 1h old.
- [ ] **Step 2: Implement** as above. **Step 3: Validate** via CI. **Step 4: Commit** `feat(kit): UsageGuard client throttle`.

---

### Task 5: ImageMath

**Files:**
- Create: `ios/FaceBackKit/Sources/FaceBackKit/ImageMath.swift`
- Test: `ios/FaceBackKit/Tests/FaceBackKitTests/ImageMathTests.swift`

**Implementation:**

```swift
public enum ImageMath {
    public static let maxEdge = 1024
    public static func scaledSize(width: Int, height: Int, maxEdge: Int = maxEdge) -> (width: Int, height: Int) {
        let longest = max(width, height)
        guard longest > maxEdge, longest > 0 else { return (width, height) }
        let scale = Double(maxEdge) / Double(longest)
        return (Int((Double(width) * scale).rounded()), Int((Double(height) * scale).rounded()))
    }
}
```

- [ ] **Step 1: Tests** - a 2048x1024 image scales to 1024x512; a 512x512 image is unchanged; a 4000x3000 image scales so the longest edge is 1024 (1024x768).
- [ ] **Step 2: Implement** as above. **Step 3: Validate** via CI. **Step 4: Commit** `feat(kit): image-scale math`.

---

### Task 6: GenerationFlow

**Files:**
- Create: `ios/FaceBackKit/Sources/FaceBackKit/GenerationFlow.swift`
- Test: `ios/FaceBackKit/Tests/FaceBackKitTests/GenerationFlowTests.swift`

**Interfaces:**
- Consumes: `ImagePayload`, `UsageGuard`.
- Produces: `GenerationDeps`, `GenerationFlow`.

**Implementation (ported from `ui/flow.ts` `runGeneration`):**

```swift
public struct GenerationDeps {
    public var now: () -> Date
    public var loadHistory: () -> [Date]
    public var saveHistory: ([Date]) -> Void
    public var inputHasFace: () async -> Bool
    public var downscale: () async throws -> ImagePayload
    public var generate: (ImagePayload) async throws -> ImagePayload
    public var outputHasFace: (ImagePayload) async -> Bool
    public init(now: @escaping () -> Date,
                loadHistory: @escaping () -> [Date],
                saveHistory: @escaping ([Date]) -> Void,
                inputHasFace: @escaping () async -> Bool,
                downscale: @escaping () async throws -> ImagePayload,
                generate: @escaping (ImagePayload) async throws -> ImagePayload,
                outputHasFace: @escaping (ImagePayload) async -> Bool) {
        self.now = now; self.loadHistory = loadHistory; self.saveHistory = saveHistory
        self.inputHasFace = inputHasFace; self.downscale = downscale
        self.generate = generate; self.outputHasFace = outputHasFace
    }
}

public enum GenerationFlow {
    public enum FlowError: Error, Equatable { case tooSoon; case noFace }
    public static func run(_ deps: GenerationDeps) async throws -> ImagePayload {
        if case .blocked = UsageGuard.decide(now: deps.now(), history: deps.loadHistory()) {
            throw FlowError.tooSoon
        }
        guard await deps.inputHasFace() else { throw FlowError.noFace }
        let encoded = try await deps.downscale()
        var result = try await deps.generate(encoded)
        if await deps.outputHasFace(result) {
            result = try await deps.generate(encoded)
        }
        deps.saveHistory(UsageGuard.record(now: deps.now(), history: deps.loadHistory()))
        return result
    }
}
```

- [ ] **Step 1: Tests** (use a small `final class Spy` to count `generate` calls) covering:
  - happy path: allowed history, `inputHasFace` true, `outputHasFace` false -> returns the generated payload; `generate` called once; `saveHistory` received one more entry.
  - throttle: history with a `now`-0.5s entry -> throws `.tooSoon`; `generate` never called.
  - no face: `inputHasFace` false -> throws `.noFace`; `downscale`/`generate` never called.
  - regenerate once: `outputHasFace` true -> `generate` called exactly twice, returns the second result.
- [ ] **Step 2: Implement** as above. **Step 3: Validate** via CI. **Step 4: Commit** `feat(kit): GenerationFlow orchestration with injected deps`.

---

## Self-Review

- **Spec coverage:** Implements spec Section 7 (APIClient + models + error mapping), Section 8 (GenerationFlow pipeline, throttle, downscale target, regenerate-once), and the `UsageGuard`/image-math units. Cookie persistence (Section 7 note) is exercised by the app at runtime, not unit-tested here. Vision/AVFoundation/CoreGraphics implementations of the injected deps are Phase 4.
- **Placeholder scan:** none; deferred endpoints are explicitly listed, not stubbed.
- **Type consistency:** `ImagePayload` is the single `{base64,mimeType}` type used for both the generate request body's inner `image` and its response; `GenerationDeps.generate` and `APIClient.generate` share the `(ImagePayload) -> ImagePayload` shape; `UsageGuard.Decision.blocked(reason:)` string `too_soon` matches the flow's `FlowError.tooSoon` mapping and the web copy code.

**Deliverable:** a green `kit-linux` job proving the entire FaceBack logic layer on Linux, ready for the app target to consume in Phase 3.
