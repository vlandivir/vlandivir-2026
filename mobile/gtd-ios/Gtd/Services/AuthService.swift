import AuthenticationServices
import Foundation
import UIKit

@MainActor
final class AuthService: NSObject, ObservableObject {
    @Published private(set) var token: String?
    @Published private(set) var isAuthenticating = false
    @Published var lastError: String?

    private var session: ASWebAuthenticationSession?

    var isSignedIn: Bool { token != nil }

    override init() {
        super.init()
        token = KeychainStore.readToken()
    }

    func signIn() async {
        lastError = nil
        isAuthenticating = true
        defer { isAuthenticating = false }

        let redirectURI = APIConfig.callbackURL.absoluteString
        var components = URLComponents(
            url: APIConfig.baseURL.appendingPathComponent("auth/google"),
            resolvingAgainstBaseURL: false
        )!
        let handoffPath =
            "/auth/native-handoff?redirect_uri=\(redirectURI.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? redirectURI)"
        components.queryItems = [
            URLQueryItem(name: "redirect", value: handoffPath),
        ]
        guard let startURL = components.url else {
            lastError = "Could not build login URL"
            return
        }

        do {
            let callbackURL = try await startWebAuth(url: startURL)
            guard
                let comps = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
                let token = comps.queryItems?.first(where: { $0.name == "token" })?.value,
                !token.isEmpty
            else {
                lastError = "Login response missing token"
                return
            }
            try KeychainStore.saveToken(token)
            self.token = token
        } catch {
            if (error as NSError).code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                return
            }
            lastError = error.localizedDescription
        }
    }

    func signOut() {
        KeychainStore.deleteToken()
        token = nil
    }

    private func startWebAuth(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: APIConfig.callbackScheme
            ) { callbackURL, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let callbackURL else {
                    continuation.resume(
                        throwing: NSError(
                            domain: "AuthService",
                            code: 1,
                            userInfo: [NSLocalizedDescriptionKey: "Empty callback"]
                        )
                    )
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            session.prefersEphemeralWebBrowserSession = false
            session.presentationContextProvider = self
            self.session = session
            if !session.start() {
                continuation.resume(
                    throwing: NSError(
                        domain: "AuthService",
                        code: 2,
                        userInfo: [NSLocalizedDescriptionKey: "Could not start login session"]
                    )
                )
            }
        }
    }
}

extension AuthService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let key = scenes.flatMap(\.windows).first(where: \.isKeyWindow) {
            return key
        }
        if let any = scenes.flatMap(\.windows).first {
            return any
        }
        return UIWindow()
    }
}
