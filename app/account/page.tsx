"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [stats, setStats] = useState({ today: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Get logged-in user
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/auth/login");
        return;
      }

      setEmail(data.user.email);

      // Fetch rewrite stats
      const todayStr = new Date().toISOString().split("T")[0];

      const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", data.user.id);

      const today = messages?.filter((m) =>
        m.created_at.startsWith(todayStr)
      ).length || 0;

      const total = messages?.length || 0;

      setStats({ today, total });
      setLoading(false);
    }

    load();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function handleDeleteData() {
    const ok = confirm("Delete ALL saved messages? This cannot be undone.");
    if (!ok) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    await supabase.from("messages").delete().eq("user_id", user.user.id);
    alert("All data deleted.");
    location.reload();
  }

  async function handleDeleteAccount() {
    const ok = confirm(
      "Delete your ENTIRE account? This cannot be undone."
    );
    if (!ok) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    await supabase.auth.admin.deleteUser(user.user.id);

    alert("Your account has been deleted.");
    router.push("/");
  }

  if (loading) return <p className="p-5">Loading account...</p>;

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Your Account</h1>

      <div className="border p-4 rounded mb-6">
        <h2 className="text-xl font-semibold mb-2">Profile</h2>

        <p className="text-gray-700 mb-2">
          <strong>Email:</strong> {email}
        </p>

        <p className="text-gray-700 mb-2">
          <strong>Role:</strong> Free User
        </p>
      </div>

      <div className="border p-4 rounded mb-6">
        <h2 className="text-xl font-semibold mb-2">Usage</h2>

        <p><strong>Rewrites Today:</strong> {stats.today}</p>
        <p><strong>Total Rewrites:</strong> {stats.total}</p>
      </div>

      <div className="border p-4 rounded mb-6">
        <h2 className="text-xl font-semibold mb-2">Security</h2>

        <button
          onClick={handleLogout}
          className="bg-gray-800 text-white px-4 py-2 rounded mr-3"
        >
          Logout
        </button>
      </div>

      <div className="border p-4 rounded">
        <h2 className="text-xl font-semibold mb-2 text-red-600">
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