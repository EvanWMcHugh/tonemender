"use client";

import { supabase } from "../../lib/supabase";

export default function LogoutButton() {
  async function handleLogout() {
    // Clear Supabase session on the server
    await supabase.auth.signOut();

    // Clear cookies set by Supabase
    document.cookie
      .split(";")
      .forEach((cookie) => {
        const name = cookie.split("=")[0].trim();
        if (name.startsWith("sb-")) {
          document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
        }
      });

    // Optional: clear localStorage if Supabase stored anything
    // Only remove Supabase-related keys if they exist
Object.keys(localStorage).forEach((k) => {
  if (k.startsWith("sb-")) localStorage.removeItem(k);
});

    // Redirect to home page
    window.location.href = "/";
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