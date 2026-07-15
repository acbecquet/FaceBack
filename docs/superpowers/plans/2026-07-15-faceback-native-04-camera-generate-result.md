# FaceBack Native 04 - Camera, Generate, Result - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the magic loop - capture or upload a photo, run it through `GenerationFlow` against real Vision/CoreGraphics/`APIClient` deps, and show the side-by-side Result with save-to-Photos. Compiles and unit-tests green on `build-test`; live camera and Photos are verified on device in Phase 5.

**Architecture:** A `CameraFlowView` (shown for a keyed, signed-in account) owns an `@Observable` `GenerationModel` and switches Camera / Generating / Result on its `phase`. `GenerationModel` builds `GenerationDeps` closing over the captured `UIImage` and runs the Phase-2 `GenerationFlow`. AVFoundation drives capture (device-only); `PHPickerViewController` provides the upload path (works in the Simulator, so the whole generate loop is exercisable there).

**Tech Stack:** SwiftUI, AVFoundation, Vision, PhotosUI/Photos, CoreGraphics/UIKit, FaceBackKit, XCTest.

## Global Constraints

- App-target code; validate on the macOS `build-test` job. Live camera capture and Photos saving cannot run in the Simulator - they are device-verified in Phase 5. The **upload path (PHPicker)** does run in the Simulator and exercises the full generate loop.
- This branch is based on `main`, which trails the deployed web app; the port matches the **polished/deployed** UX (read from commit `c8aff77`), not the older `web/` in this branch.
- Verbatim copy:
  - Camera hint: `Back camera - tap switch for front` / `Front camera - tap switch for back`; unavailable: `Camera unavailable. You can upload a photo instead.`
  - Generating: `Generating the back of your head...` and `usually about 5-10 seconds`.
  - Result header: `It's just the back of their head.`; captions `Original` / `Back`; buttons `Save`, `Retry`, `Discard`.
  - Error copy (ported from `App.tsx messageFor`): FlowError `.tooSoon` -> `Please wait a moment before generating again.`; `.noFace` -> `No face detected - try another photo.`; APIError `daily_limit` -> `Daily limit reached. Try again tomorrow.`; `no_key`/`dev_key_unset` -> `No Gemini API key set yet - add one in Settings (tap the gear icon).`; other APIError -> its message; anything else -> `Something went wrong. Try again.`
- Mirror rule: front camera preview is mirrored AND the captured photo is flipped horizontally to match; back camera is not mirrored. Default facing is back.
- Pipeline: input face-gate is forgiving (block only when Vision confidently finds no face; allow on error); downscale longest edge 1024, JPEG 0.9; regenerate once if the output still shows a face. Throttle history in `UserDefaults` key `faceback.usage`.
- Settings gear stays hidden (Settings is a deferred phase).
- No em dashes; never auto-add an agent commit co-author.

## File layout

```
ios/FaceBack/
  Imaging/
    FaceGate.swift        (Vision face count; input/output helpers)
    ImageEncoder.swift    (downscale+JPEG->ImagePayload; decode; horizontal mirror)
    UsageStore.swift      (UserDefaults throttle history)
  Generate/
    GenerationModel.swift (@Observable @MainActor; phase; runs GenerationFlow)
    ErrorCopy.swift       (messageFor mapping)
  Camera/
    CameraModel.swift     (AVCaptureSession + photo capture + mirror)
    CameraPreview.swift   (UIViewRepresentable over AVCaptureVideoPreviewLayer)
    PhotoPicker.swift     (PHPickerViewController wrapper)
  Photos/
    PhotoSaver.swift      (PHPhotoLibrary add-only save)
  Screens/
    CameraFlowView.swift  (owns GenerationModel; switches Camera/Generating/Result)
    CameraView.swift  GeneratingView.swift  ResultView.swift
ios/FaceBackTests/
  GenerationModelTests.swift  ImageEncoderTests.swift
```
`RootView` changes: the keyed-signed-in branch renders `CameraFlowView(api:session:)` instead of `CameraPlaceholderView`. `FaceBackApp`/`RootView` thread the shared `APIClient` down so `GenerationModel` and `SessionModel` use the same cookie session.

## Key implementations

`FaceGate.swift`:
```swift
import Vision
import UIKit
enum FaceGate {
    static func faceCount(in cgImage: CGImage) -> Int? {
        let request = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do { try handler.perform([request]); return request.results?.count ?? 0 }
        catch { return nil }
    }
    static func hasFaceForInput(_ image: UIImage) -> Bool {   // forgiving: allow on error
        guard let cg = image.cgImage else { return true }
        return (faceCount(in: cg) ?? 1) > 0
    }
    static func hasFaceForOutput(_ image: UIImage) -> Bool {  // regenerate only on a real detection
        guard let cg = image.cgImage else { return false }
        return (faceCount(in: cg) ?? 0) > 0
    }
}
```

`ImageEncoder.swift`:
```swift
import UIKit
import FaceBackKit
enum ImageEncoder {
    static func encodeForUpload(_ image: UIImage) -> ImagePayload? {
        guard let cg = image.cgImage else { return nil }
        let target = ImageMath.scaledSize(width: cg.width, height: cg.height)
        let format = UIGraphicsImageRendererFormat.default(); format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: target.width, height: target.height), format: format)
        let resized = renderer.image { _ in image.draw(in: CGRect(x: 0, y: 0, width: target.width, height: target.height)) }
        guard let data = resized.jpegData(compressionQuality: 0.9) else { return nil }
        return ImagePayload(base64: data.base64EncodedString(), mimeType: "image/jpeg")
    }
    static func image(from payload: ImagePayload) -> UIImage? {
        Data(base64Encoded: payload.base64).flatMap(UIImage.init(data:))
    }
    static func mirrored(_ image: UIImage) -> UIImage {
        guard let cg = image.cgImage else { return image }
        return UIImage(cgImage: cg, scale: image.scale, orientation: .upMirrored)
    }
}
```

`GenerationModel.swift` (the wiring): `@MainActor @Observable`, `enum Phase { case idle; case generating; case result(GenResult) }` where `GenResult { let original: UIImage; let generated: UIImage }`, plus `var errorMessage: String?`. `generate(from original: UIImage) async` sets `.generating`, builds `GenerationDeps` (now: `Date()`; loadHistory/saveHistory via `UsageStore`; inputHasFace: `FaceGate.hasFaceForInput(original)`; downscale: `ImageEncoder.encodeForUpload(original)` or throw; generate: `api.generate`; outputHasFace: decode payload then `FaceGate.hasFaceForOutput`), runs `GenerationFlow.run`, decodes the result to a `UIImage`, sets `.result`. On error: `.idle`, then if APIError `unauthorized` -> `session.signOut()`; if `no_key`/`dev_key_unset` -> `session.refresh()`; set `errorMessage = ErrorCopy.message(for:)`. `discard()`/`retry()` reset to `.idle` and clear the error. `nonisolated init(api:session:)`.

`CameraModel.swift`: `@MainActor @Observable final class CameraModel: NSObject`, holds `AVCaptureSession` + `AVCapturePhotoOutput`, `facing` (default `.back`), `available`. `start()` requests camera authorization, configures the session for `facing`, and `startRunning()` off-main; `stop()`; `flip()` reconfigures; `capture() async throws -> UIImage` via a `CheckedContinuation` resumed in the `AVCapturePhotoCaptureDelegate` callback, flipping the image with `ImageEncoder.mirrored` when `facing == .front`. If no device/permission, `available = false`.

`CameraView`, `GeneratingView`, `ResultView`: faithful ports (see Global Constraints copy). Result uses a 2-column layout: `figure(Original)` and `figure(Back)`, then `FBButton("Save")`, then a row of secondary `Retry`/`Discard`. Camera shows `CameraPreview` (mirrored when front) with the hint overlay, and a bottom row of upload (opens `PhotoPicker`) / shutter / flip; when `!available` it shows the unavailable copy and leans on upload. `CameraFlowView` switches on `generationModel.phase` and surfaces `errorMessage` on the Camera screen.

## Tasks

- [ ] **Task 1 - Imaging:** `FaceGate`, `ImageEncoder`, `UsageStore` + `ImageEncoderTests` (downscale a synthetic `UIImage` to longest-edge 1024; round-trip `image(from:)` of a known base64). Commit `feat(app): Vision face gate, image encoder, usage store`.
- [ ] **Task 2 - Generate:** `ErrorCopy`, `GenerationModel` + `GenerationModelTests` (with a fake `FaceBackAPI` and a stub `SessionModel`): happy path sets `.result`; a thrown `daily_limit` sets `.idle` + the mapped message; `unauthorized` signs the session out. Commit `feat(app): GenerationModel and error copy`.
- [ ] **Task 3 - Camera:** `CameraModel`, `CameraPreview`, `PhotoPicker`. Commit `feat(app): AVFoundation camera, preview, and photo picker`.
- [ ] **Task 4 - Photos + screens:** `PhotoSaver`, `GeneratingView`, `ResultView`, `CameraView`, `CameraFlowView`; wire `RootView`/`FaceBackApp` to share the `APIClient`. Commit `feat(app): camera/generating/result screens and save-to-Photos`.

## Self-Review

- **Spec coverage:** Implements spec Section 6 (Camera/Generating/Result), Section 8 (pipeline via `GenerationFlow` with real deps), Section 9 (AVFoundation + Vision + mirror rule + PHPicker fallback), Section 10 (save-to-Photos), and Section 12 error copy. The in-app gallery save (collection) stays deferred; Save writes to Photos.
- **Placeholder scan:** none; the camera's device-only limitation is called out, not stubbed - the upload path is a real, working alternative.
- **Type consistency:** `GenerationModel` consumes `GenerationDeps`/`GenerationFlow`/`ImagePayload`/`APIError`/`GenerationFlow.FlowError` exactly as defined in Phase 2; `ImageEncoder` uses `ImageMath.scaledSize`; screens read `GenerationModel.phase`/`errorMessage` and `CameraModel.facing`/`available`.

**Deliverable:** picking a photo generates a back-of-head and shows the side-by-side Result with a working Save (verified via the upload path + unit tests on CI); live camera capture is ready for on-device verification in Phase 5.
