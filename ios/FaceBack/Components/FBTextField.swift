import SwiftUI
import UIKit

/// Labeled input with an optional trailing accessory. Mirrors `.fb-field`.
struct FBTextField: View {
    let label: String
    @Binding var text: String
    var secure: Bool = false
    var keyboard: UIKeyboardType = .default
    var trailing: AnyView? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.muted)

            HStack(spacing: 8) {
                Group {
                    if secure {
                        SecureField("", text: $text)
                    } else {
                        TextField("", text: $text)
                    }
                }
                .keyboardType(keyboard)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

                if let trailing {
                    trailing
                }
            }
            .font(.system(size: 15))
            .padding(.vertical, 11)
            .padding(.horizontal, 12)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
            .overlay {
                RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line)
            }
        }
        .padding(.bottom, 12)
    }
}
