import SwiftUI

/// Cold-launch spinner shown while `session.refresh()` resolves the account.
struct LoadingView: View {
    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            ProgressView()
                .tint(Theme.blue)
                .accessibilityIdentifier("loading-spinner")
        }
    }
}

#Preview {
    LoadingView()
}
