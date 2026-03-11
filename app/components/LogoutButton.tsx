"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);

    try {
      // Invalidate server session + cookie
      await fetch("/api/auth/sign-out", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
      });
    } catch {
      // ignore — logout is best-effort
    }

    // Cleanup any leftover Supabase artifacts from old builds
    if (typeof document !== "undefined") {
      document.cookie.split(";").forEach((cookie) => {
        const name = cookie.split("=")[0]?.trim();
        if (name && name.startsWith("sb-")) {
          document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
        }
      });
    }

    if (typeof window !== "undefined") {
      try {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("sb-")) {
            localStorage.removeItem(key);
          }
        });
      } catch {}
    }

    // Redirect after logout
    router.replace("/sign-in");
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      aria-busy={loading}
      className="absolute top-4 right-4 text-sm bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 disabled:opacity-50 transition"
    >
      {loading ? "Logging out…" : "Logout"}
    </button>
  );
}