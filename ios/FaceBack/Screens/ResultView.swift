import SwiftUI

/// Side-by-side result. Faithful port of the polished/deployed
/// `web/src/ui/screens/Result.tsx` (Original | Back, captioned).
struct ResultView: View {
    let result: GenerationModel.GenResult
    let onSave: (UIImage) -> Void
    let onRetry: () -> Void
    let onDiscard: () -> Void

    @State private var saved = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("It's just the back of their head.")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.text)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Theme.bg)

            ScrollView {
                VStack(spacing: 12) {
                    HStack(alignment: .top, spacing: 8) {
                        figure(result.original, caption: "Original")
                        figure(result.generated, caption: "Back")
                    }
                    FBButton(title: saved ? "Saved" : "Save", disabled: saved) {
                        onSave(result.generated)
                        saved = true
                    }
                    HStack(spacing: 8) {
                        FBButton(title: "Retry", variant: .secondary, action: onRetry)
                        FBButton(title: "Discard", variant: .secondary, action: onDiscard)
                    }
                }
                .padding(16)
            }
            .background(Theme.bg)
        }
    }

    private func figure(_ image: UIImage, caption: String) -> some View {
        VStack(spacing: 6) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: .infinity)
                .background(Theme.card)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            Text(caption)
                .font(.system(size: 12))
                .foregroundStyle(Theme.muted)
        }
    }
}
