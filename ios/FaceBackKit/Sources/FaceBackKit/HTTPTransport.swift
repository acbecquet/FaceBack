import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Abstracts a single HTTP round-trip so `APIClient` can be tested with an
/// injected fake, with no real network and no reliance on `URLProtocol`
/// (whose Linux support is unreliable).
public protocol HTTPTransport {
    func send(_ request: URLRequest) async throws -> (data: Data, status: Int)
}

/// The real transport used by the app. Wraps the completion-handler `dataTask`
/// in a continuation, which is portable to Linux (and avoids the question of
/// whether the async `data(for:)` API is available there).
public struct URLSessionTransport: HTTPTransport {
    let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func send(_ request: URLRequest) async throws -> (data: Data, status: Int) {
        try await withCheckedThrowingContinuation { continuation in
            let task = session.dataTask(with: request) { data, response, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let http = response as? HTTPURLResponse else {
                    continuation.resume(throwing: APIError(code: "no_response", message: "No HTTP response"))
                    return
                }
                continuation.resume(returning: (data: data ?? Data(), status: http.statusCode))
            }
            task.resume()
        }
    }
}
