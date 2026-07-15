import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The backend surface the native app calls. Mirrors the MVP subset of
/// `web/src/units/apiClient.ts` and `generationClient.ts`.
public protocol FaceBackAPI {
    func me() async -> PublicAccount?
    func signup(username: String, email: String) async throws
    func requestCode(identifier: String) async throws
    func verify(identifier: String, code: String) async throws -> PublicAccount
    func logout() async throws
    func setInitialKey(_ apiKey: String) async throws
    func generate(_ image: ImagePayload) async throws -> ImagePayload
}

/// Talks to the Cloudflare backend over an injectable `HTTPTransport`. The
/// `fb_session` cookie is carried automatically by the underlying `URLSession`
/// (see `URLSessionTransport`), reproducing the web client's `credentials: "include"`.
public final class APIClient: FaceBackAPI {
    private let baseURL: URL
    private let transport: HTTPTransport

    public init(baseURL: URL, transport: HTTPTransport) {
        self.baseURL = baseURL
        self.transport = transport
    }

    public convenience init(baseURL: URL, session: URLSession = .shared) {
        self.init(baseURL: baseURL, transport: URLSessionTransport(session: session))
    }

    // MARK: - Endpoints

    public func me() async -> PublicAccount? {
        do {
            let data = try await perform("/me", method: "GET", body: nil)
            return try JSONDecoder().decode(PublicAccount.self, from: data)
        } catch {
            return nil
        }
    }

    public func signup(username: String, email: String) async throws {
        _ = try await perform("/auth/signup", method: "POST",
                              body: jsonBody(["username": username, "email": email]))
    }

    public func requestCode(identifier: String) async throws {
        _ = try await perform("/auth/request", method: "POST",
                              body: jsonBody(["identifier": identifier]))
    }

    public func verify(identifier: String, code: String) async throws -> PublicAccount {
        let data = try await perform("/auth/verify", method: "POST",
                                     body: jsonBody(["identifier": identifier, "code": code]))
        return try JSONDecoder().decode(AccountEnvelope.self, from: data).account
    }

    public func logout() async throws {
        _ = try await perform("/auth/logout", method: "POST", body: nil)
    }

    public func setInitialKey(_ apiKey: String) async throws {
        _ = try await perform("/key", method: "POST", body: jsonBody(["apiKey": apiKey]))
    }

    public func generate(_ image: ImagePayload) async throws -> ImagePayload {
        let data = try await perform("/generate", method: "POST",
                                     body: try? JSONEncoder().encode(GenerateRequest(image: image)))
        return try JSONDecoder().decode(GenerateResponse.self, from: data).image
    }

    // MARK: - Core

    private func perform(_ path: String, method: String, body: Data?) async throws -> Data {
        guard let url = URL(string: baseURL.absoluteString + path) else {
            throw APIError(code: "bad_url", message: "Invalid URL for \(path)")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let (data, status) = try await transport.send(request)
        guard (200..<300).contains(status) else {
            if let envelope = try? JSONDecoder().decode(ServerErrorEnvelope.self, from: data) {
                throw APIError(code: envelope.error.code, message: envelope.error.message)
            }
            throw APIError(code: "request_failed", message: "Request failed (\(status))")
        }
        return data
    }

    private func jsonBody(_ dict: [String: String]) -> Data? {
        try? JSONEncoder().encode(dict)
    }
}

private struct AccountEnvelope: Decodable { let account: PublicAccount }
private struct GenerateRequest: Encodable { let image: ImagePayload }
private struct GenerateResponse: Decodable { let image: ImagePayload }
