import XCTest
import UIKit
import FaceBackKit
@testable import FaceBack

@MainActor
final class GenerationModelTests: XCTestCase {
    private final class FakeAPI: FaceBackAPI {
        var meResult: PublicAccount?
        var generateResult: ImagePayload?
        var generateError: Error?

        func me() async -> PublicAccount? { meResult }
        func signup(username: String, email: String) async throws {}
        func requestCode(identifier: String) async throws {}
        func verify(identifier: String, code: String) async throws -> PublicAccount {
            meResult ?? PublicAccount(username: "c", email: "c@x.com", hasOwnKey: true, isDev: false, usesDevKey: false)
        }
        func logout() async throws {}
        func setInitialKey(_ apiKey: String) async throws {}
        func generate(_ image: ImagePayload) async throws -> ImagePayload {
            if let generateError { throw generateError }
            return generateResult ?? image
        }
    }

    private func solidImage() -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16), format: format).image { context in
            UIColor.gray.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 16, height: 16))
        }
    }

    private func jpegPayload() -> ImagePayload {
        ImageEncoder.encodeForUpload(solidImage())!
    }

    private func account() -> PublicAccount {
        PublicAccount(username: "c", email: "c@x.com", hasOwnKey: true, isDev: false, usesDevKey: false)
    }

    func testNoFaceInputShowsNoFaceMessage() async {
        let api = FakeAPI()
        let session = SessionModel(api: api)
        let model = GenerationModel(api: api, session: session, inputHasFace: { _ in false })
        await model.generate(from: solidImage())
        if case .idle = model.phase {} else { XCTFail("expected idle") }
        XCTAssertEqual(model.errorMessage, "No face detected - try another photo.")
    }

    func testHappyPathProducesResult() async {
        let api = FakeAPI(); api.generateResult = jpegPayload()
        let session = SessionModel(api: api)
        let model = GenerationModel(api: api, session: session,
                                    inputHasFace: { _ in true }, outputHasFace: { _ in false })
        await model.generate(from: solidImage())
        if case .result = model.phase {} else { XCTFail("expected result") }
        XCTAssertNil(model.errorMessage)
    }

    func testDailyLimitMapsToCopy() async {
        let api = FakeAPI(); api.generateError = APIError(code: "daily_limit", message: "x")
        let session = SessionModel(api: api)
        let model = GenerationModel(api: api, session: session,
                                    inputHasFace: { _ in true }, outputHasFace: { _ in false })
        await model.generate(from: solidImage())
        XCTAssertEqual(model.errorMessage, "Daily limit reached. Try again tomorrow.")
    }

    func testUnauthorizedSignsSessionOut() async {
        let api = FakeAPI()
        api.meResult = account()
        let session = SessionModel(api: api)
        await session.refresh()
        XCTAssertEqual(session.account, .signedIn(account()))

        api.generateError = APIError(code: "unauthorized", message: "x")
        let model = GenerationModel(api: api, session: session,
                                    inputHasFace: { _ in true }, outputHasFace: { _ in false })
        await model.generate(from: solidImage())
        XCTAssertEqual(session.account, .signedOut)
    }
}
