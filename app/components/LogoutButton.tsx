"use client";

export default function LogoutButton() {
  async function handleLogout() {
    try {
      // Invalidate session cookie + DB session
      await fetch("/api/auth/sign-out", {
        method: "POST",
        cache: "no-store",
      });
    } catch {
      // ignore — best effort
    }

    // Clear any leftover Supabase artifacts from legacy builds
    if (typeof document !== "undefined") {
      document.cookie.split(";").forEach((cookie) => {
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

    // 🔒 Hard redirect AFTER session is gone
    window.location.href = "/sign-in";
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