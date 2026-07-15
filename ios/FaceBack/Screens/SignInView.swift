import SwiftUI
import FaceBackKit

/// Sign-in and account-creation. Faithful port of `web/src/ui/screens/SignIn.tsx`.
struct SignInView: View {
    let session: SessionModel

    private enum Mode { case signin, create }

    @State private var mode: Mode = .signin
    @State private var identifier = ""
    @State private var username = ""
    @State private var email = ""
    @State private var code = ""
    @State private var sent = false
    @State private var busy = false
    @State private var error = ""

    private var identifierValid: Bool { !identifier.trimmed.isEmpty }
    private var createValid: Bool { !username.trimmed.isEmpty && email.contains("@") }
    private var codeValid: Bool { code.count == 6 }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                VStack(spacing: 4) {
                    Wordmark(size: 30)
                    Text("See the side of you that you never see.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                }
                .padding(24)
                .padding(.top, 24)

                VStack(spacing: 0) {
                    if mode == .signin {
                        FBTextField(label: "Email or username", text: $identifier)
                    } else {
                        FBTextField(label: "Username", text: $username)
                        FBTextField(label: "Email", text: $email, keyboard: .emailAddress)
                    }

                    if sent {
                        FBTextField(label: "Verification code", text: $code, keyboard: .numberPad)
                    }

                    if !error.isEmpty {
                        HStack {
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.errorRed)
                            Spacer()
                        }
                        .padding(.bottom, 8)
                    }

                    if sent {
                        FBButton(title: busy ? "Verifying..." : "Verify", disabled: !codeValid || busy) {
                            Task { await submitVerify() }
                        }
                    } else {
                        FBButton(
                            title: busy ? "Sending..." : "Send code",
                            disabled: (mode == .signin ? !identifierValid : !createValid) || busy
                        ) {
                            Task { await sendCode() }
                        }
                        Button {
                            switchMode(mode == .signin ? .create : .signin)
                        } label: {
                            Text(mode == .signin ? "New here? Create an account" : "Already have an account? Sign in")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.blue)
                                .frame(maxWidth: .infinity)
                        }
                        .padding(.top, 12)
                    }
                }
                .padding(.horizontal, 20)
                .onChange(of: code) { _, newValue in
                    let filtered = String(newValue.filter(\.isNumber).prefix(6))
                    if filtered != newValue { code = filtered }
                }

                Spacer()
            }
        }
    }

    private func switchMode(_ next: Mode) {
        mode = next
        sent = false
        code = ""
        error = ""
    }

    private func sendCode() async {
        busy = true
        error = ""
        do {
            if mode == .signin {
                try await session.requestSignInCode(identifier: identifier.trimmed)
            } else {
                try await session.signUp(username: username.trimmed, email: email.trimmed)
            }
            sent = true
        } catch {
            self.error = describeError(error, isSignInRequest: mode == .signin)
        }
        busy = false
    }

    private func submitVerify() async {
        busy = true
        error = ""
        let id = mode == .signin ? identifier.trimmed : email.trimmed
        do {
            try await session.verify(identifier: id, code: code)
            // Success: the account becomes signedIn and RootView replaces this screen.
        } catch {
            self.error = describeError(error, isSignInRequest: false)
            busy = false
        }
    }

    private func describeError(_ error: Error, isSignInRequest: Bool) -> String {
        if let api = error as? APIError {
            if isSignInRequest && api.code == "no_account" {
                return "No account with that email or username."
            }
            return api.message
        }
        return "Something went wrong. Try again."
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespaces) }
}
