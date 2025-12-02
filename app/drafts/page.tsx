"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<any[]>([]);

  useEffect(() => {
    loadDrafts();
  }, []);

  async function loadDrafts() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDrafts(data);
    }
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Your Drafts</h1>

      {drafts.length === 0 && (
        <p className="text-gray-500">No drafts saved yet.</p>
      )}

      <div className="flex flex-col gap-4">
        {drafts.map((d) => (
          <div key={d.id} className="border p-4 rounded bg-white shadow">
            <p className="text-sm text-gray-400">{d.created_at}</p>
            <p className="mt-2"><strong>Original:</strong> {d.message}</p>
            <p className="mt-2"><strong>Soft:</strong> {d.soft}</p>
            <p className="mt-2"><strong>Calm:</strong> {d.calm}</p>
            <p className="mt-2"><strong>Clear:</strong> {d.clear}</p>
          </div>
        ))}
      </div>
    </main>
  );
}