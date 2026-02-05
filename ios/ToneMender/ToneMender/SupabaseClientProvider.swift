import Supabase

enum SupabaseClientProvider {
    static let client = SupabaseClient(
        supabaseURL: Env.supabaseURL,
        supabaseKey: Env.supabasePublishableKey,
        options: .init(
            auth: .init(emitLocalSessionAsInitialSession: true)
        )
    )
}
