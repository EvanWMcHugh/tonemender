"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LogoutButtonProps = {
  className?: string;
};

export default function LogoutButton({ className = "" }: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);

    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
      });
    } catch {
      // best-effort logout
    }

    if (typeof document !== "undefined") {
      document.cookie.split(";").forEach((cookie) => {
        const name = cookie.split("=")[0]?.trim();

        if (name?.startsWith("sb-")) {
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
      } catch {
        // ignore localStorage cleanup failures
      }
    }

    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      aria-busy={loading}
      className={`rounded-xl bg-slate-200 px-3 py-1.5 text-sm text-slate-800 transition hover:bg-slate-300 disabled:opacity-50 ${className}`}
    >
      {loading ? "Logging out…" : "Logout"}
    </button>
  );
}