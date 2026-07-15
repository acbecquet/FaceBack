import XCTest
@testable import FaceBackKit

final class ModelsTests: XCTestCase {
    func testDecodePublicAccountFromServerJSON() throws {
        let data = Data(#"{"username":"a","email":"a@b.c","hasOwnKey":true,"isDev":false,"usesDevKey":false}"#.utf8)
        let account = try JSONDecoder().decode(PublicAccount.self, from: data)
        XCTAssertEqual(account.username, "a")
        XCTAssertEqual(account.email, "a@b.c")
        XCTAssertTrue(account.hasOwnKey)
        XCTAssertFalse(account.isDev)
        XCTAssertFalse(account.usesDevKey)
    }

    func testImagePayloadRoundTrip() throws {
        let payload = ImagePayload(base64: "QUJD", mimeType: "image/jpeg")
        let encoded = try JSONEncoder().encode(payload)
        let decoded = try JSONDecoder().decode(ImagePayload.self, from: encoded)
        XCTAssertEqual(decoded, payload)
    }
}
