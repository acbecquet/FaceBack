import SwiftUI

/// Full-width primary/secondary button. Mirrors `.fb-btn` / `.fb-btn.sec`.
struct FBButton: View {
    enum Variant { case primary, secondary }

    let title: String
    var variant: Variant = .primary
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(12)
        }
        .foregroundStyle(variant == .primary ? Color.white : Theme.text)
        .background(variant == .primary ? Theme.blue : Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
        .overlay {
            if variant == .secondary {
                RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line)
            }
        }
        .opacity(disabled ? 0.5 : 1)
        .disabled(disabled)
    }
}
