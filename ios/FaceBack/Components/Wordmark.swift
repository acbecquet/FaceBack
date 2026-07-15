import SwiftUI

/// The "FaceBack" wordmark. Mirrors `web/src/ui/components/Wordmark.tsx`
/// (heavy weight, tight tracking, brand blue).
struct Wordmark: View {
    var size: CGFloat = 20

    var body: some View {
        Text("FaceBack")
            .font(.system(size: size, weight: .heavy))
            .tracking(-0.03 * size)
            .foregroundStyle(Theme.blue)
    }
}
