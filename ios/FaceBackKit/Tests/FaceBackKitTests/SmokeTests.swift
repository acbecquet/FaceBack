import XCTest
@testable import FaceBackKit

final class SmokeTests: XCTestCase {
    func testKitHasVersion() {
        XCTAssertEqual(FaceBackKit.version, "0.1.0")
    }
}
