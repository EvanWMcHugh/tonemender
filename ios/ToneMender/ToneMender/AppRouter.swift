import SwiftUI

struct AppRouter: View {
    @StateObject private var auth = AuthService.shared

    var body: some View {
        Group {
            if auth.session != nil {
                MainTabView()
            } else {
                SignInView()
            }
        }
        .task { await auth.loadSession() }
    }
}
