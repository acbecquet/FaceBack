import XCTest
@testable import FaceBackKit

final class ImageMathTests: XCTestCase {
    func testScalesDownLongestEdge() {
        let size = ImageMath.scaledSize(width: 2048, height: 1024)
        XCTAssertEqual(size.width, 1024)
        XCTAssertEqual(size.height, 512)
    }

    func testLeavesSmallImageUnchanged() {
        let size = ImageMath.scaledSize(width: 512, height: 512)
        XCTAssertEqual(size.width, 512)
        XCTAssertEqual(size.height, 512)
    }

    func testScalesLandscapeToMaxEdge() {
        let size = ImageMath.scaledSize(width: 4000, height: 3000)
        XCTAssertEqual(size.width, 1024)
        XCTAssertEqual(size.height, 768)
    }
}
