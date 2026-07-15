import Foundation
import Observation
import UIKit
import FaceBackKit

enum GenerationModelError: Error { case encodeFailed }

/// Owns the generation phase and runs the Phase-2 `GenerationFlow` against real
/// deps (Vision, CoreGraphics, `APIClient`, `UserDefaults`). Mirrors the
/// `handleCapture` logic in `web/src/App.tsx`. Face detection is injectable so
/// the flow can be unit-tested without a face image.
@MainActor
@Observable
final class GenerationModel {
    struct GenResult { let original: UIImage; let generated: UIImage }
    enum Phase { case idle; case generating; case result(GenResult) }

    private(set) var phase: Phase = .idle
    var errorMessage: String?

    private let api: FaceBackAPI
    private let session: SessionModel
    private let inputHasFace: (UIImage) -> Bool
    private let outputHasFace: (UIImage) -> Bool

    nonisolated init(
        api: FaceBackAPI,
        session: SessionModel,
        inputHasFace: @escaping (UIImage) -> Bool = FaceGate.hasFaceForInput,
        outputHasFace: @escaping (UIImage) -> Bool = FaceGate.hasFaceForOutput
    ) {
        self.api = api
        self.session = session
        self.inputHasFace = inputHasFace
        self.outputHasFace = outputHasFace
    }

    func generate(from original: UIImage) async {
        phase = .generating
        errorMessage = nil

        let api = self.api
        let inputHasFace = self.inputHasFace
        let outputHasFace = self.outputHasFace

        let deps = GenerationDeps(
            now: { Date() },
            loadHistory: { UsageStore.load() },
            saveHistory: { UsageStore.save($0) },
            inputHasFace: { inputHasFace(original) },
            downscale: {
                guard let payload = ImageEncoder.encodeForUpload(original) else {
                    throw GenerationModelError.encodeFailed
                }
                return payload
            },
            generate: { payload in try await api.generate(payload) },
            outputHasFace: { payload in
                guard let image = ImageEncoder.image(from: payload) else { return false }
                return outputHasFace(image)
            }
        )

        do {
            let payload = try await GenerationFlow.run(deps)
            guard let generated = ImageEncoder.image(from: payload) else {
                phase = .idle
                errorMessage = "Something went wrong. Try again."
                return
            }
            phase = .result(GenResult(original: original, generated: generated))
        } catch {
            phase = .idle
            await handle(error)
        }
    }

    func discard() {
        phase = .idle
        errorMessage = nil
    }

    func retry() {
        phase = .idle
        errorMessage = nil
    }

    private func handle(_ error: Error) async {
        if let apiError = error as? APIError {
            if apiError.code == "unauthorized" {
                await session.signOut()
                return
            }
            if apiError.code == "no_key" || apiError.code == "dev_key_unset" {
                await session.refresh()
            }
        }
        errorMessage = ErrorCopy.message(for: error)
    }
}
