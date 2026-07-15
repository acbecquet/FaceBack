import XCTest
import FaceBackKit
@testable import FaceBack

@MainActor
final class SessionModelTests: XCTestCase {
    private final class FakeAPI: FaceBackAPI {
        var meResult: PublicAccount?
        var verifyResult: PublicAccount?
        var setKeyCalled = false
        var logoutCalled = false

        func me() async -> PublicAccount? { meResult }
        func signup(username: String, email: String) async throws {}
        func requestCode(identifier: String) async throws {}
        func verify(identifier: String, code: String) async throws -> PublicAccount {
            guard let verifyResult else { throw APIError(code: "bad", message: "no result") }
            return verifyResult
        }
        func logout() async throws { logoutCalled = true }
        func setInitialKey(_ apiKey: String) async throws { setKeyCalled = true }
        func generate(_ image: ImagePayload) async throws -> ImagePayload { image }
    }

    private func account(hasOwnKey: Bool = true, usesDevKey: Bool = false) -> PublicAccount {
        PublicAccount(username: "c", email: "c@x.com", hasOwnKey: hasOwnKey, isDev: false, usesDevKey: usesDevKey)
    }

    func testRefreshSignsInWhenMeReturnsAccount() async {
        let api = FakeAPI(); api.meResult = account()
        let session = SessionModel(api: api)
        await session.refresh()
        XCTAssertEqual(session.account, .signedIn(account()))
    }

    func testRefreshSignsOutWhenMeReturnsNil() async {
        let api = FakeAPI(); api.meResult = nil
        let session = SessionModel(api: api)
        await session.refresh()
        XCTAssertEqual(session.account, .signedOut)
    }

    func testVerifySetsSignedIn() async throws {
        let api = FakeAPI(); api.verifyResult = account()
        let session = SessionModel(api: api)
        try await session.verify(identifier: "c@x.com", code: "123456")
        XCTAssertEqual(session.account, .signedIn(account()))
    }

    func testNeedsKeyTrueWhenNoKeyAndNotDevKey() async {
        let api = FakeAPI(); api.meResult = account(hasOwnKey: false, usesDevKey: false)
        let session = SessionModel(api: api)
        await session.refresh()
        XCTAssertTrue(session.needsKey)
    }

    func testNeedsKeyFalseWhenHasOwnKey() async {
        let api = FakeAPI(); api.meResult = account(hasOwnKey: true)
        let session = SessionModel(api: api)
        await session.refresh()
        XCTAssertFalse(session.needsKey)
    }

    func testNeedsKeyFalseWhenUsesDevKey() async {
        let api = FakeAPI(); api.meResult = account(hasOwnKey: false, usesDevKey: true)
        let session = SessionModel(api: api)
        await session.refresh()
        XCTAssertFalse(session.needsKey)
    }

    func testSetKeyCallsBackendThenRefreshes() async throws {
        let api = FakeAPI(); api.meResult = account(hasOwnKey: true)
        let session = SessionModel(api: api)
        try await session.setKey("my-key")
        XCTAssertTrue(api.setKeyCalled)
        XCTAssertEqual(session.account, .signedIn(account(hasOwnKey: true)))
    }

    func testSignOut() async {
        let api = FakeAPI(); api.meResult = account()
        let session = SessionModel(api: api)
        await session.refresh()
        await session.signOut()
        XCTAssertTrue(api.logoutCalled)
        XCTAssertEqual(session.account, .signedOut)
    }
}
