import XCTest
@testable import FaceBackKit

final class APIErrorTests: XCTestCase {
    func testDecodesServerErrorEnvelope() throws {
        let data = Data(#"{"error":{"code":"daily_limit","message":"Come back tomorrow"}}"#.utf8)
        let envelope = try JSONDecoder().decode(ServerErrorEnvelope.self, from: data)
        XCTAssertEqual(envelope.error.code, "daily_limit")
        XCTAssertEqual(envelope.error.message, "Come back tomorrow")
    }

    func testAPIErrorEquatable() {
        XCTAssertEqual(APIError(code: "a", message: "b"), APIError(code: "a", message: "b"))
        XCTAssertNotEqual(APIError(code: "a", message: "b"), APIError(code: "x", message: "b"))
    }
}
