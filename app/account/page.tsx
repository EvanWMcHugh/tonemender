"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [stats, setStats] = useState({ today: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    async function load() {
      // Get logged-in user
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/sign-in");
        return;
      }

      const userId = auth.user.id;
      setEmail(auth.user.email);

      // -------- PRO STATUS ----------
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_pro")
        .eq("id", userId)
        .single();

      setIsPro(profile?.is_pro === true);

      // -------- REWRITE COUNTS ----------
      const todayStr = new Date().toISOString().split("T")[0];

      // Daily count
      const { count: todayCount } = await supabase
        .from("rewrite_usage")
        .select("id", { count: "exact" })
        .eq("user_id", userId)
        .gte("created_at", todayStr);

      // Total count
      const { count: totalCount } = await supabase
        .from("rewrite_usage")
        .select("id", { count: "exact" })
        .eq("user_id", userId);

      setStats({
        today: todayCount ?? 0,
        total: totalCount ?? 0,
      });

      setLoading(false);
    }

    load();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) return <p className="p-5">Loading account...</p>;

  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Your Account</h1>

      <div className="border p-4 rounded mb-6">
        <h2 className="text-xl font-semibold mb-2">Profile</h2>
        <p><strong>Email:</strong> {email}</p>
        <p><strong>Plan:</strong> {isPro ? "Pro" : "Free"}</p>
      </div>

      <div className="border p-4 rounded mb-6">
        <h2 className="text-xl font-semibold mb-2">Rewrite Usage</h2>
        <p><strong>Rewrites Today:</strong> {stats.today}</p>
        <p><strong>Total Rewrites:</strong> {stats.total}</p>
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
    </main>
  );
}