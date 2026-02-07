"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    // Fast UX: move user immediately
    router.replace("/sign-in");

    // Then invalidate session cookie + DB session
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } catch {
      // ignore — user is already redirected
    }

    // Optional: clear any leftover Supabase keys from past builds
    if (typeof document !== "undefined") {
      document.cookie
        .split(";")
        .forEach((cookie) => {
          const name = cookie.split("=")[0].trim();
          if (name.startsWith("sb-")) {
            document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
          }
        });
    }

    if (typeof window !== "undefined") {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("sb-")) localStorage.removeItem(k);
      });
    }
  }

  return (
    <button
      onClick={handleLogout}
      className="absolute top-4 right-4 text-sm bg-gray-200 px-3 py-1 rounded"
    >
      Logout
    </button>
  );
}