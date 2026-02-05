import Foundation
import Combine
import Supabase

@MainActor
final class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published private(set) var session: Session?

    private let client = SupabaseClientProvider.client
    private init() {}

    func loadSession() async {
        do {
            let s = try await client.auth.session
            if s.isExpired {
                session = nil
            } else {
                session = s
            }
        } catch {
            session = nil
        }
    }
    // MARK: - Auth

    func signIn(email: String, password: String) async throws {
        let result: Any = try await client.auth.signIn(email: email, password: password)
        session = extractSession(from: result)
    }

    func signUp(email: String, password: String) async throws {
        let result: Any = try await client.auth.signUp(email: email, password: password)

        if let s = extractSession(from: result) {
            session = s
        } else {
            session = try? await client.auth.session
        }
    }

    func resetPassword(email: String) async throws {
        try await client.auth.resetPasswordForEmail(email)
    }

    func signOut() async throws {
        try await client.auth.signOut()
        session = nil
    }

    // MARK: - Convenience

    var accessToken: String? { session?.accessToken }
    var userEmail: String? { session?.user.email }

    // MARK: - Helpers

    private func extractSession(from result: Any) -> Session? {
        // Some versions return Session directly
        if let s = result as? Session { return s }

        // Some versions return AuthResponse { session: Session? }
        if let r = result as? AuthResponse { return r.session }

        return nil
    }
}
