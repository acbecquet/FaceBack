import Foundation

/// Injected dependencies for `GenerationFlow`. The app supplies concrete
/// implementations (Vision for the face checks, CoreGraphics for downscale,
/// `APIClient` for generate, `UserDefaults` for history) in Phase 4; tests
/// supply fakes. Mirrors `GenerationDeps` / `App.makeDeps` in the web app.
///
/// The "forgiving" degrade-open behavior for Vision lives in the caller's
/// `inputHasFace` closure (it returns `true` when detection is unavailable or
/// errors), so this flow simply trusts the boolean.
public struct GenerationDeps {
    public var now: () -> Date
    public var loadHistory: () -> [Date]
    public var saveHistory: ([Date]) -> Void
    public var inputHasFace: () async -> Bool
    public var downscale: () async throws -> ImagePayload
    public var generate: (ImagePayload) async throws -> ImagePayload
    public var outputHasFace: (ImagePayload) async -> Bool

    public init(
        now: @escaping () -> Date,
        loadHistory: @escaping () -> [Date],
        saveHistory: @escaping ([Date]) -> Void,
        inputHasFace: @escaping () async -> Bool,
        downscale: @escaping () async throws -> ImagePayload,
        generate: @escaping (ImagePayload) async throws -> ImagePayload,
        outputHasFace: @escaping (ImagePayload) async -> Bool
    ) {
        self.now = now
        self.loadHistory = loadHistory
        self.saveHistory = saveHistory
        self.inputHasFace = inputHasFace
        self.downscale = downscale
        self.generate = generate
        self.outputHasFace = outputHasFace
    }
}

/// Orchestrates one generation: throttle -> input face gate -> downscale ->
/// generate -> regenerate once if the result still shows a face -> record usage.
/// A faithful port of `runGeneration` in `web/src/ui/flow.ts`.
public enum GenerationFlow {
    public enum FlowError: Error, Equatable {
        case tooSoon
        case noFace
    }

    public static func run(_ deps: GenerationDeps) async throws -> ImagePayload {
        if case .blocked = UsageGuard.decide(now: deps.now(), history: deps.loadHistory()) {
            throw FlowError.tooSoon
        }
        guard await deps.inputHasFace() else {
            throw FlowError.noFace
        }
        let encoded = try await deps.downscale()
        var result = try await deps.generate(encoded)
        if await deps.outputHasFace(result) {
            result = try await deps.generate(encoded)
        }
        deps.saveHistory(UsageGuard.record(now: deps.now(), history: deps.loadHistory()))
        return result
    }
}
