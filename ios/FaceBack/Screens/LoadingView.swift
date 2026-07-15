import SwiftUI

/// Cold-launch placeholder. Replaced by the real navigation state machine in Phase 3.
struct LoadingView: View {
    var body: some View {
        ProgressView()
            .accessibilityIdentifier("loading-spinner")
    }
}

#Preview {
    LoadingView()
}
