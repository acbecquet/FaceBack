import SwiftUI

/// The navigation state machine. Mirrors the render precedence in
/// `web/src/App.tsx`: loading -> SignIn -> AddKey -> Camera.
struct RootView: View {
    let session: SessionModel

    var body: some View {
        switch session.account {
        case .loading:
            LoadingView()
        case .signedOut:
            SignInView(session: session)
        case .signedIn:
            if session.needsKey {
                AddKeyView(session: session)
            } else {
                CameraPlaceholderView()
            }
        }
    }
}
