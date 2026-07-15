import XCTest
import FaceBackKit
@testable import FaceBack

final class ErrorCopyTests: XCTestCase {
    func testFlowErrors() {
        XCTAssertEqual(ErrorCopy.message(for: GenerationFlow.FlowError.tooSoon),
                       "Please wait a moment before generating again.")
        XCTAssertEqual(ErrorCopy.message(for: GenerationFlow.FlowError.noFace),
                       "No face detected - try another photo.")
    }

    func testAPIErrors() {
        XCTAssertEqual(ErrorCopy.message(for: APIError(code: "daily_limit", message: "x")),
                       "Daily limit reached. Try again tomorrow.")
        XCTAssertEqual(ErrorCopy.message(for: APIError(code: "no_key", message: "x")),
                       "No Gemini API key set yet - add one in Settings (tap the gear icon).")
        XCTAssertEqual(ErrorCopy.message(for: APIError(code: "dev_key_unset", message: "x")),
                       "No Gemini API key set yet - add one in Settings (tap the gear icon).")
        XCTAssertEqual(ErrorCopy.message(for: APIError(code: "weird", message: "server says hi")),
                       "server says hi")
    }

    func testUnknownError() {
        struct SomeError: Error {}
        XCTAssertEqual(ErrorCopy.message(for: SomeError()), "Something went wrong. Try again.")
    }
}
