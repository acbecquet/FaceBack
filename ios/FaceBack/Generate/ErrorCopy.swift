import Foundation
import FaceBackKit

/// Maps pipeline and API errors to user-facing copy, verbatim from
/// `messageFor` in `web/src/App.tsx`.
enum ErrorCopy {
    static func message(for error: Error) -> String {
        if let flow = error as? GenerationFlow.FlowError {
            switch flow {
            case .tooSoon: return "Please wait a moment before generating again."
            case .noFace: return "No face detected - try another photo."
            }
        }
        if let api = error as? APIError {
            switch api.code {
            case "daily_limit":
                return "Daily limit reached. Try again tomorrow."
            case "no_key", "dev_key_unset":
                return "No Gemini API key set yet - add one in Settings (tap the gear icon)."
            default:
                return api.message
            }
        }
        return "Something went wrong. Try again."
    }
}
