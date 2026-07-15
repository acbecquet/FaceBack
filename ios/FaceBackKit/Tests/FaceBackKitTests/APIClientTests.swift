import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import FaceBackKit

/// A transport that returns whatever the injected handler produces, capturing
/// the request so tests can assert method and path. No real network.
private struct FakeTransport: HTTPTransport {
    let handler: (URLRequest) throws -> (Data, Int)
    func send(_ request: URLRequest) async throws -> (data: Data, status: Int) {
        let (data, status) = try handler(request)
        return (data: data, status: status)
    }
}

final class APIClientTests: XCTestCase {
    private let base = URL(string: "https://test.local/api")!

    private func client(_ handler: @escaping (URLRequest) throws -> (Data, Int)) -> APIClient {
        APIClient(baseURL: base, transport: FakeTransport(handler: handler))
    }

    func testMeReturnsAccountOn200() async {
        let json = Data(#"{"username":"charlie","email":"c@x.com","hasOwnKey":true,"isDev":false,"usesDevKey":false}"#.utf8)
        let account = await client { _ in (json, 200) }.me()
        XCTAssertEqual(account?.username, "charlie")
        XCTAssertEqual(account?.hasOwnKey, true)
    }

    func testMeReturnsNilOn401() async {
        let json = Data(#"{"error":{"code":"unauthorized","message":"nope"}}"#.utf8)
        let account = await client { _ in (json, 401) }.me()
        XCTAssertNil(account)
    }

    func testVerifyReturnsAccount() async throws {
        let json = Data(#"{"account":{"username":"c","email":"c@x.com","hasOwnKey":false,"isDev":true,"usesDevKey":true}}"#.utf8)
        let account = try await client { _ in (json, 200) }.verify(identifier: "c@x.com", code: "123456")
        XCTAssertTrue(account.isDev)
        XCTAssertTrue(account.usesDevKey)
    }

    func testGenerateReturnsInnerImageAndPostsToPath() async throws {
        let json = Data(#"{"image":{"base64":"QUJD","mimeType":"image/jpeg"}}"#.utf8)
        final class Captured { var request: URLRequest? }
        let captured = Captured()
        let out = try await client { req in
            captured.request = req
            return (json, 200)
        }.generate(ImagePayload(base64: "AAAA", mimeType: "image/jpeg"))
        XCTAssertEqual(out.base64, "QUJD")
        XCTAssertEqual(out.mimeType, "image/jpeg")
        XCTAssertEqual(captured.request?.httpMethod, "POST")
        XCTAssertEqual(captured.request?.url?.path, "/api/generate")
    }

    func testGenerateMapsServerErrorCode() async {
        let json = Data(#"{"error":{"code":"daily_limit","message":"tomorrow"}}"#.utf8)
        do {
            _ = try await client { _ in (json, 429) }.generate(ImagePayload(base64: "A", mimeType: "image/jpeg"))
            XCTFail("expected a thrown error")
        } catch let error as APIError {
            XCTAssertEqual(error.code, "daily_limit")
        } catch {
            XCTFail("wrong error type: \(error)")
        }
    }

    func testNonJSONErrorMapsToRequestFailed() async {
        do {
            _ = try await client { _ in (Data("<html>500</html>".utf8), 500) }
                .generate(ImagePayload(base64: "A", mimeType: "image/jpeg"))
            XCTFail("expected a thrown error")
        } catch let error as APIError {
            XCTAssertEqual(error.code, "request_failed")
        } catch {
            XCTFail("wrong error type: \(error)")
        }
    }

    func testLogoutAndSetKeySucceedOn200() async throws {
        let ok = client { _ in (Data(#"{"ok":true}"#.utf8), 200) }
        try await ok.logout()
        try await ok.setInitialKey("my-key")
    }
}
