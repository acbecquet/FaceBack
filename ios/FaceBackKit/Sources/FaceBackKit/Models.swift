import Foundation

/// The public account shape returned by `GET /api/me` and `POST /api/auth/verify`.
/// Mirrors `PublicAccount` in `web/src/units/apiClient.ts`.
public struct PublicAccount: Codable, Equatable, Sendable {
    public let username: String
    public let email: String
    public let hasOwnKey: Bool
    public let isDev: Bool
    public let usesDevKey: Bool

    public init(username: String, email: String, hasOwnKey: Bool, isDev: Bool, usesDevKey: Bool) {
        self.username = username
        self.email = email
        self.hasOwnKey = hasOwnKey
        self.isDev = isDev
        self.usesDevKey = usesDevKey
    }
}

/// A base64-encoded image with its MIME type. Used for both the generate request
/// body's inner `image` and the generated result.
public struct ImagePayload: Codable, Equatable, Sendable {
    public let base64: String
    public let mimeType: String

    public init(base64: String, mimeType: String) {
        self.base64 = base64
        self.mimeType = mimeType
    }
}
