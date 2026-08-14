import SwiftUI

struct LoginView: View {
    @ObservedObject var auth: AuthService

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Text("GTD")
                .font(.system(size: 48, weight: .bold, design: .rounded))
            Text("Same inbox as web and Telegram.\nSign in with your Google account.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 32)

            if let error = auth.lastError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .padding(.horizontal)
            }

            Button {
                Task { await auth.signIn() }
            } label: {
                if auth.isAuthenticating {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Sign in with Google")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(auth.isAuthenticating)
            .padding(.horizontal, 32)

            Spacer()
        }
        .padding()
    }
}
