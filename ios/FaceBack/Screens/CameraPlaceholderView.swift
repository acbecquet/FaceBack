import SwiftUI

/// Temporary stand-in for the signed-in-with-key state. Replaced by the real
/// Camera screen in Phase 4.
struct CameraPlaceholderView: View {
    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 8) {
                Wordmark(size: 28)
                Text("Signed in. Camera arrives in Phase 4.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
            }
        }
    }
}
