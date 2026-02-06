"use client";

import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    try {
      // 1️⃣ Sign out from Supabase Auth
      await supabase.auth.signOut();

      // 2️⃣ Clear Supabase auth cookies (sb-*)
      if (typeof document !== "undefined") {
        document.cookie.split(";").forEach((cookie) => {
          const name = cookie.split("=")[0]?.trim();
          if (name?.startsWith("sb-")) {
            document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
          }
        });
      }

      // 3️⃣ Clear Supabase-related localStorage keys
      if (typeof window !== "undefined") {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("sb-")) {
            localStorage.removeItem(key);
          }
        });
      }

      // 4️⃣ Redirect cleanly to landing/home
      router.replace("/");
    } catch (err) {
      console.error("Logout failed:", err);
      // Fallback: hard redirect if something unexpected happens
      window.location.href = "/";
    }
  }

  return (
    <button
      onClick={handleLogout}
      className="absolute top-4 right-4 text-sm bg-gray-200 hover:bg-gray-300 transition px-3 py-1 rounded"
    >
      Logout
    </button>
  );
}