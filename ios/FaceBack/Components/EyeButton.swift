import SwiftUI

/// Show/hide toggle used as the AddKey field's trailing accessory.
struct EyeButton: View {
    @Binding var revealed: Bool

    var body: some View {
        Button {
            revealed.toggle()
        } label: {
            Image(systemName: revealed ? "eye.slash" : "eye")
                .foregroundStyle(Theme.muted)
        }
        .accessibilityLabel("Toggle key visibility")
    }
}
