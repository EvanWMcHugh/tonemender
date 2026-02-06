"use client";

import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    // 1) Immediately navigate (fast UX)
    router.replace("/sign-in");

    // 2) Then sign out (even if signOut is slow, user already moved)
    await supabase.auth.signOut();

    // Optional: clear any Supabase cookie/local keys (fine to keep)
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