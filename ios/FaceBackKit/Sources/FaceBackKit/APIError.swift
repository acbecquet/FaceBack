import Foundation

/// A typed backend error, carrying the server's `code` (e.g. `daily_limit`,
/// `no_key`, `unauthorized`) and human message. Mirrors `ApiError` in the web client.
public struct APIError: Error, Equatable, Sendable {
    public let code: String
    public let message: String

    public init(code: String, message: String) {
        self.code = code
        self.message = message
    }
}

/// Decodes the backend's non-2xx error shape `{ "error": { "code", "message" } }`.
struct ServerErrorEnvelope: Decodable {
    struct Body: Decodable {
        let code: String
        let message: String
    }
    let error: Body
}
