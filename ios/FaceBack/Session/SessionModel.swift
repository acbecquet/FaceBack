import Foundation
import Observation
import FaceBackKit

/// Drives the root navigation and owns the account lifecycle. Mirrors the
/// account state and auth handlers in `web/src/App.tsx`. Main-actor isolated so
/// all published state changes happen on the main thread.
@MainActor
@Observable
final class SessionModel {
    enum AccountState: Equatable {
        case loading
        case signedOut
        case signedIn(PublicAccount)
    }

    private(set) var account: AccountState = .loading

    private let api: FaceBackAPI

    nonisolated init(api: FaceBackAPI) {
        self.api = api
    }

    /// True when signed in with no usable key (matches the web AddKey gate).
    var needsKey: Bool {
        if case .signedIn(let account) = account {
            return !account.hasOwnKey && !account.usesDevKey
        }
        return false
    }

    func refresh() async {
        account = await api.me().map(AccountState.signedIn) ?? .signedOut
    }

    func requestSignInCode(identifier: String) async throws {
        try await api.requestCode(identifier: identifier)
    }

    func signUp(username: String, email: String) async throws {
        try await api.signup(username: username, email: email)
    }

    func verify(identifier: String, code: String) async throws {
        account = .signedIn(try await api.verify(identifier: identifier, code: code))
    }

    func setKey(_ apiKey: String) async throws {
        try await api.setInitialKey(apiKey)
        await refresh()
    }

    func signOut() async {
        try? await api.logout()
        account = .signedOut
    }
}
