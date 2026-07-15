import SwiftUI

/// Progress screen. Faithful port of `web/src/ui/screens/Generating.tsx`.
struct GeneratingView: View {
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Wordmark(size: 17)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Theme.bg)

            VStack(spacing: 16) {
                ProgressView()
                    .tint(Theme.blue)
                    .scaleEffect(1.4)
                Text("Generating the back of your head...")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.text)
                Text("usually about 5-10 seconds")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bg)
        }
    }
}
