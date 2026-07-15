# FaceBack Native 01 - Scaffold & CI - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `ios/` project scaffold and a GitHub Actions pipeline that builds and tests a minimal SwiftUI app on a macOS runner and runs the FaceBackKit package tests on Linux, both green - the "walking skeleton" that proves the whole Linux-authored / CI-verified loop before any feature code exists.

**Architecture:** A native SwiftUI app target (`FaceBack`) plus a platform-free Swift package (`FaceBackKit`) live under `ios/`. The Xcode project is defined declaratively in `project.yml` and generated on the runner with XcodeGen, so there is no binary `.xcodeproj` in git. CI has two jobs: a Linux job that runs `swift test` on `FaceBackKit`, and a macOS job that generates the project and runs `xcodebuild test` on a Simulator.

**Tech Stack:** Swift 5.9+, SwiftUI, iOS 17 deployment target, Swift Package Manager, XcodeGen, XCTest, XCUITest, GitHub Actions (`ubuntu-latest` + `swift` container, `macos-14`).

## Global Constraints

These apply to every task in this plan and the whole port.

- Deployment target: iOS 17.0. Swift tools version 5.9.
- Bundle identifier (single source of truth, used here and in App Store Connect): `com.becquet.faceback`.
- Everything is authored on Linux; nothing is compiled locally except `FaceBackKit` via `swift test`. The app target compiles only on the macOS runner.
- No em dashes in any file. Use a plain dash.
- Never auto-add an agent co-author to commits.
- All native source lives under `ios/`; CI workflow lives at `.github/workflows/ios.yml`.
- Identical UX to the web app is the standing product principle (see the spec); this plan only builds scaffolding, no user-facing behavior yet.

---

### Task 1: FaceBackKit package with a smoke test (Linux-green)

**Files:**
- Create: `ios/FaceBackKit/Package.swift`
- Create: `ios/FaceBackKit/Sources/FaceBackKit/FaceBackKit.swift`
- Test: `ios/FaceBackKit/Tests/FaceBackKitTests/SmokeTests.swift`

**Interfaces:**
- Consumes: nothing.
- Produces: `enum FaceBackKit { static let version: String }` - a trivial anchor so the package and its test target build and run on Linux. Later tasks add the real types alongside it.

- [ ] **Step 1: Write the failing test**

`ios/FaceBackKit/Tests/FaceBackKitTests/SmokeTests.swift`:

```swift
import XCTest
@testable import FaceBackKit

final class SmokeTests: XCTestCase {
    func testKitHasVersion() {
        XCTAssertEqual(FaceBackKit.version, "0.1.0")
    }
}
```

- [ ] **Step 2: Create the package manifest**

`ios/FaceBackKit/Package.swift`:

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FaceBackKit",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "FaceBackKit", targets: ["FaceBackKit"]),
    ],
    targets: [
        .target(name: "FaceBackKit"),
        .testTarget(name: "FaceBackKitTests", dependencies: ["FaceBackKit"]),
    ]
)
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd ios/FaceBackKit && swift test`
Expected: FAIL - compile error, `FaceBackKit` has no member `version` (the source file does not exist yet).

- [ ] **Step 4: Write the minimal implementation**

`ios/FaceBackKit/Sources/FaceBackKit/FaceBackKit.swift`:

```swift
/// Namespace anchor for the platform-free FaceBack logic package.
public enum FaceBackKit {
    public static let version = "0.1.0"
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd ios/FaceBackKit && swift test`
Expected: PASS - `Executed 1 test, with 0 failures`.

- [ ] **Step 6: Commit**

```bash
git add ios/FaceBackKit
git commit -m "feat(ios): FaceBackKit package skeleton with a Linux smoke test"
```

---

### Task 2: Minimal SwiftUI app + XcodeGen project definition

**Files:**
- Create: `ios/project.yml`
- Create: `ios/FaceBack/FaceBackApp.swift`
- Create: `ios/FaceBack/Screens/LoadingView.swift`
- Create: `ios/.gitignore`

**Interfaces:**
- Consumes: the `FaceBackKit` package from Task 1 (declared as a local package dependency so the wiring is proven early).
- Produces: an installable app whose root view is `LoadingView` (a centered spinner with accessibility id `loading-spinner`); an `xcodegen generate` step that yields `ios/FaceBack.xcodeproj`.

- [ ] **Step 1: Write the app entry point**

`ios/FaceBack/FaceBackApp.swift`:

```swift
import SwiftUI

@main
struct FaceBackApp: App {
    var body: some Scene {
        WindowGroup {
            LoadingView()
        }
    }
}
```

- [ ] **Step 2: Write the placeholder root view**

`ios/FaceBack/Screens/LoadingView.swift`:

```swift
import SwiftUI

/// Cold-launch placeholder. Replaced by the real state machine in plan 03.
struct LoadingView: View {
    var body: some View {
        ProgressView()
            .accessibilityIdentifier("loading-spinner")
    }
}
```

- [ ] **Step 3: Write the XcodeGen project definition**

`ios/project.yml`:

```yaml
name: FaceBack
options:
  bundleIdPrefix: com.becquet
  deploymentTarget:
    iOS: "17.0"
  createIntermediateGroups: true
packages:
  FaceBackKit:
    path: FaceBackKit
targets:
  FaceBack:
    type: application
    platform: iOS
    sources:
      - path: FaceBack
    dependencies:
      - package: FaceBackKit
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.becquet.faceback
        MARKETING_VERSION: "0.1.0"
        CURRENT_PROJECT_VERSION: "1"
        DEVELOPMENT_TEAM: ""
        CODE_SIGNING_ALLOWED: "NO"
    info:
      path: FaceBack/Info.plist
      properties:
        CFBundleDisplayName: FaceBack
        UILaunchScreen: {}
        NSCameraUsageDescription: "FaceBack uses the camera to take the photo it turns into the back of a head."
        NSPhotoLibraryAddUsageDescription: "FaceBack saves your generated image to your photo library."
  FaceBackUITests:
    type: bundle.ui-testing
    platform: iOS
    sources:
      - path: FaceBackUITests
    dependencies:
      - target: FaceBack
```

Note: `CODE_SIGNING_ALLOWED: NO` lets the Simulator build and test run without any signing identity; real signing is introduced in plan 05. The `info.path` file is generated by XcodeGen from the `properties` block, so no `Info.plist` is committed.

- [ ] **Step 4: Write the gitignore**

`ios/.gitignore`:

```gitignore
# Generated by XcodeGen on the runner - never committed
FaceBack.xcodeproj/
# Xcode/SwiftPM build output
.build/
DerivedData/
*.xcresult
```

- [ ] **Step 5: Commit (project generation is verified in CI in Task 3)**

```bash
git add ios/project.yml ios/FaceBack ios/.gitignore
git commit -m "feat(ios): minimal SwiftUI app target and XcodeGen project definition"
```

---

### Task 3: UI-test the launch, and the CI workflow that runs everything

**Files:**
- Create: `ios/FaceBackUITests/LaunchTests.swift`
- Create: `.github/workflows/ios.yml`

**Interfaces:**
- Consumes: the `FaceBack` app target (Task 2) and the `FaceBackKit` package (Task 1).
- Produces: a green CI run with two jobs - `kit-linux` (`swift test`) and `build-test` (`xcodegen generate` then `xcodebuild test` on a Simulator) - plus an uploaded `.xcresult` artifact.

- [ ] **Step 1: Write the launch UI test**

`ios/FaceBackUITests/LaunchTests.swift`:

```swift
import XCTest

final class LaunchTests: XCTestCase {
    func testAppLaunchesToForeground() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
    }

    func testLoadingSpinnerIsPresent() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(
            app.activityIndicators["loading-spinner"].waitForExistence(timeout: 10)
        )
    }
}
```

- [ ] **Step 2: Write the CI workflow**

`.github/workflows/ios.yml`:

```yaml
name: iOS

on:
  push:
    paths: [ "ios/**", ".github/workflows/ios.yml" ]
  pull_request:
    paths: [ "ios/**", ".github/workflows/ios.yml" ]

jobs:
  kit-linux:
    name: FaceBackKit (Linux)
    runs-on: ubuntu-latest
    container: swift:5.10
    steps:
      - uses: actions/checkout@v4
      - name: swift test
        working-directory: ios/FaceBackKit
        run: swift test

  build-test:
    name: App build & test (Simulator)
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - name: Install tools
        run: brew install xcodegen xcbeautify
      - name: Generate Xcode project
        working-directory: ios
        run: xcodegen generate
      - name: Select a simulator
        id: sim
        run: |
          # Pick the first available iPhone simulator name for the installed Xcode.
          NAME=$(xcrun simctl list devices available | grep -Eo 'iPhone 1[5-9]( Pro)?' | head -1)
          echo "name=${NAME:-iPhone 15}" >> "$GITHUB_OUTPUT"
      - name: Build & test
        working-directory: ios
        run: |
          set -o pipefail
          xcodebuild test \
            -project FaceBack.xcodeproj \
            -scheme FaceBack \
            -destination "platform=iOS Simulator,name=${{ steps.sim.outputs.name }}" \
            -resultBundlePath TestResults.xcresult \
            CODE_SIGNING_ALLOWED=NO \
            | xcbeautify
      - name: Upload result bundle
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: xcresult
          path: ios/TestResults.xcresult
```

- [ ] **Step 3: Commit**

```bash
git add ios/FaceBackUITests .github/workflows/ios.yml
git commit -m "ci(ios): build+test on macOS runner and swift test on Linux"
```

- [ ] **Step 4: Push and verify CI is green**

```bash
git push
```

Then check the run:

```bash
gh run list --workflow=ios.yml --limit 1
gh run watch $(gh run list --workflow=ios.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

Expected: both jobs succeed. `kit-linux` reports `Executed 1 test`. `build-test` reports the two UI tests passing and uploads `xcresult`.

- [ ] **Step 5: If `build-test` fails on the destination, fix the simulator name and re-push**

If the log shows `Unable to find a destination`, list what the runner has and pin it:

```bash
# From the failed run log, read the available names, then hardcode one in the
# "Select a simulator" step's fallback (replace "iPhone 15").
```

Re-commit the workflow edit and push until both jobs are green.

---

## Self-Review

- **Spec coverage:** This plan implements the spec's Section 4 (module layout: `ios/`, `FaceBack` app target, `FaceBackKit` package, XcodeGen) and Section 13's per-push CI (xcodegen generate, xcodebuild build+test on Simulator, swift test on Linux, artifact upload). Signing/TestFlight (Section 13 on-demand lane, Section 15) is deliberately out of scope here and lives in plan 05. Screens, networking, camera, and the flow are later plans. No spec requirement assigned to this plan is unaddressed.
- **Placeholder scan:** No TBD/TODO. `DEVELOPMENT_TEAM: ""` with `CODE_SIGNING_ALLOWED: NO` is an intentional, working value for Simulator-only CI, not a placeholder; real signing arrives in plan 05.
- **Type consistency:** `FaceBackKit.version` (Task 1) is the only produced symbol and is consumed nowhere yet. `loading-spinner` accessibility id is defined in `LoadingView` (Task 2) and asserted in `LaunchTests` (Task 3) - consistent. The bundle id `com.becquet.faceback` matches the Global Constraints.

**Deliverable:** a green two-job CI pipeline on `native-swiftui-port` proving the Linux-authored, runner-verified loop end to end, with a minimal SwiftUI app that launches to a spinner.

## As-built notes (2026-07-15, executed green)

Deviations from the steps above, kept for accuracy:

- **Test target:** used a minimal unit-test target `FaceBackTests` (`AppSmokeTests.testAppModuleCompilesAndLoads`) instead of the XCUITest `FaceBackUITests`/`LaunchTests` in Task 3. It proves the `xcodebuild test` pipeline on the Simulator reliably; XCUITest plus screenshots are deferred to a phase with real screens to drive.
- **CI workflow** needed three fixes to reach green (all in `.github/workflows/ios.yml`): select the latest Xcode on the runner (XcodeGen emits Xcode 16 format `77` that the default Xcode 15.x cannot read); pick the Simulator by UDID via `simctl ... -j | jq` rather than by name; and a push-only trigger plus a `concurrency` group to avoid duplicate runs.
- **project.yml** includes an explicit `schemes:` block for the `FaceBack` scheme and generates the Info.plist via the `info:` block (git-ignored).
