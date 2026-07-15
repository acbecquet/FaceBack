import XCTest
import UIKit
import FaceBackKit
@testable import FaceBack

final class ImageEncoderTests: XCTestCase {
    private func solidImage(width: Int, height: Int) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
            UIColor.gray.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    func testEncodeDownscalesLongestEdgeTo1024() throws {
        let payload = try XCTUnwrap(ImageEncoder.encodeForUpload(solidImage(width: 2000, height: 1000)))
        XCTAssertEqual(payload.mimeType, "image/jpeg")
        let decoded = try XCTUnwrap(ImageEncoder.image(from: payload))
        XCTAssertEqual(Int(decoded.size.width.rounded()), 1024)
        XCTAssertEqual(Int(decoded.size.height.rounded()), 512)
    }

    func testSmallImageIsNotUpscaled() throws {
        let payload = try XCTUnwrap(ImageEncoder.encodeForUpload(solidImage(width: 300, height: 200)))
        let decoded = try XCTUnwrap(ImageEncoder.image(from: payload))
        XCTAssertEqual(Int(decoded.size.width.rounded()), 300)
        XCTAssertEqual(Int(decoded.size.height.rounded()), 200)
    }

    func testImageFromPayloadRoundTrips() throws {
        let payload = try XCTUnwrap(ImageEncoder.encodeForUpload(solidImage(width: 16, height: 16)))
        XCTAssertNotNil(ImageEncoder.image(from: payload))
    }
}
