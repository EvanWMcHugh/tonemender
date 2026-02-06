"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

type SafeSession = {
  userId?: string;
  email?: string;
  expiresAt?: number;
  provider?: string;
};

export default function DebugPage() {
  const router = useRouter();

  // ✅ Hard-lock this page to development only
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      router.replace("/"); // or "/landing" if you prefer
    }
  }, [router]);

  const [session, setSession] = useState<SafeSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      const s = data.session;

      if (!s) {
        setSession(null);
        setLoaded(true);
        return;
      }

      // 🔒 Never expose tokens
      setSession({
        userId: s.user?.id,
        email: s.user?.email ?? undefined,
        expiresAt: s.expires_at ?? undefined,
        provider: s.user?.app_metadata?.provider,
      });

      setLoaded(true);
    }

    load();
  }, []);

  if (!loaded) {
    return (
      <main className="p-6 text-sm text-gray-600">Loading debug session…</main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="text-lg font-semibold mb-3">Debug Session (Dev Only)</h1>

      <pre className="bg-slate-100 border rounded-lg p-4 text-xs overflow-auto">
        {JSON.stringify(session, null, 2)}
      </pre>

      <p className="mt-3 text-xs text-slate-500">
        ⚠️ This page is disabled in production and intentionally hides auth
        tokens.
      </p>
    </main>
  );
}