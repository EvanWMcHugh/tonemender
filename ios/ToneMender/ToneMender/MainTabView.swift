import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            RewriteView()
                .tabItem { Label("Rewrite", systemImage: "wand.and.stars") }

            DraftsView()
                .tabItem { Label("Drafts", systemImage: "doc.text") }

            AccountView()
                .tabItem { Label("Account", systemImage: "person.circle") }
        }
    }
}
