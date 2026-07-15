import Vision
import UIKit

/// Vision-backed face detection. Mirrors `web/src/units/faceGate.ts`, but on
/// native the detector actually runs (iOS Safari lacks `FaceDetector`).
enum FaceGate {
    /// Number of faces detected, or `nil` if detection could not run.
    static func faceCount(in cgImage: CGImage) -> Int? {
        let request = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
            return request.results?.count ?? 0
        } catch {
            return nil
        }
    }

    /// Input gate: forgiving. Allow when a face is present, or when detection
    /// cannot run (degrade open), matching the web app's fail-open posture.
    static func hasFaceForInput(_ image: UIImage) -> Bool {
        guard let cgImage = image.cgImage else { return true }
        return (faceCount(in: cgImage) ?? 1) > 0
    }

    /// Output check: only report a face on a real detection, so a failed detect
    /// does not trigger an unnecessary regenerate.
    static func hasFaceForOutput(_ image: UIImage) -> Bool {
        guard let cgImage = image.cgImage else { return false }
        return (faceCount(in: cgImage) ?? 0) > 0
    }
}
