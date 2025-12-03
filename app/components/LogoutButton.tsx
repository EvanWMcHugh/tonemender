"use client";

import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();

    // Wait for Supabase to finish clearing session
    await new Promise((resolve) => setTimeout(resolve, 200));

    router.replace("/sign-in");
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