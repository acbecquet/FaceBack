import SwiftUI
import FaceBackKit

/// Set the initial Gemini key. Faithful port of `web/src/ui/screens/AddKey.tsx`.
struct AddKeyView: View {
    let session: SessionModel

    @State private var apiKey = ""
    @State private var showKey = false
    @State private var busy = false
    @State private var error = ""

    private var valid: Bool { !apiKey.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                VStack(spacing: 4) {
                    Wordmark(size: 30)
                    Text("Add your Nano Banana 2 / Gemini key to start generating.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                }
                .padding(24)
                .padding(.top, 24)

                VStack(spacing: 0) {
                    FBTextField(
                        label: "Nano Banana 2 key",
                        text: $apiKey,
                        secure: !showKey,
                        trailing: AnyView(EyeButton(revealed: $showKey))
                    )

                    if !error.isEmpty {
                        HStack {
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.errorRed)
                            Spacer()
                        }
                        .padding(.bottom, 8)
                    }

                    FBButton(title: busy ? "Saving..." : "Save key", disabled: !valid || busy) {
                        Task { await save() }
                    }
                }
                .padding(.horizontal, 20)

                Spacer()
            }
        }
    }

    private func save() async {
        busy = true
        error = ""
        do {
            try await session.setKey(apiKey.trimmingCharacters(in: .whitespaces))
            // Success: refresh() routes past AddKey.
        } catch {
            self.error = (error as? APIError)?.message ?? "Something went wrong. Try again."
            busy = false
        }
    }
}
