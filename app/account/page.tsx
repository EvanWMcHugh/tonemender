"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AccountPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [stats, setStats] = useState({ today: 0, total: 0 });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        router.replace("/sign-in");
        return;
      }

      setEmail(user.email);

      const todayStr = new Date().toISOString().split("T")[0];

      const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", user.id);

      const today = messages?.filter(
        (m) => m.created_at.startsWith(todayStr)
      ).length || 0;

      const total = messages?.length || 0;

      setStats({ today, total });
      setLoading(false);
    }

    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function handleDeleteData() {
    const ok = confirm("Delete ALL messages? This cannot be undone.");
    if (!ok) return;

    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;

    await supabase.from("messages").delete().eq("user_id", user.id);
    alert("All messages deleted.");
  }

  async function handleDeleteAccount() {
    const ok = confirm("Delete your ENTIRE account?");
    if (!ok) return;

    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;

    await supabase.auth.admin.deleteUser(user.id);
    alert("Account deleted.");
    router.push("/");
  }

  if (loading) return <main className="p-6">Loading account…</main>;

  return (
    <main className="max-w-xl mx-auto p-6">

      {/* BACK BUTTON */}
      <Link
        href="/"
        className="inline-block mb-4 bg-gray-200 px-4 py-2 rounded"
      >
        ← Back
      </Link>

      <h1 className="text-3xl font-bold mb-4">Your Account</h1>

      <div className="border p-4 rounded mb-6">
        <h2 className="text-xl font-semibold mb-2">Profile</h2>

        <p><strong>Email:</strong> {email}</p>
        <p><strong>Role:</strong> Free User</p>
      </div>

      <div className="border p-4 rounded mb-6">
        <h2 className="text-xl font-semibold mb-2">Usage</h2>
        <p><strong>Rewrites Today:</strong> {stats.today}</p>
        <p><strong>Total:</strong> {stats.total}</p>
      </div>

      <div className="border p-4 rounded mb-6">
        <h2 className="text-xl font-semibold mb-2">Security</h2>
        <button
          onClick={handleLogout}
          className="bg-gray-800 text-white px-4 py-2 rounded"
        >
          Logout
        </button>
      </div>

      <div className="border p-4 rounded">
        <h2 className="text-xl font-semibold text-red-600 mb-2">
          Danger Zone
        </h2>

        <button
          onClick={handleDeleteData}
          className="border border-red-500 text-red-600 px-4 py-2 rounded mr-3"
        >
          Delete All Messages
        </button>

        <button
          onClick={handleDeleteAccount}
          className="bg-red-600 text-white px-4 py-2 rounded"
        >
          Delete Account
        </button>
      </div>
    </main>
  );
}