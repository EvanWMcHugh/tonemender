"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Draft = {
  id: string;
  created_at: string;
  original: string | null;
  tone: string | null;
  soft_rewrite: string | null;
  calm_rewrite: string | null;
  clear_rewrite: string | null;
};

export default function DraftsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError("");

      try {
        // ✅ cookie-auth session check
        const meResp = await fetch("/api/me", { method: "GET" });
        const meJson = await meResp.json().catch(() => ({ user: null }));

        if (!meJson?.user?.id) {
          router.replace("/sign-in?error=not-authenticated");
          return;
        }

        // ✅ fetch drafts via server route
        const resp = await fetch("/api/messages", { method: "GET" });
        const json = await resp.json().catch(() => ({}));

        if (cancelled) return;

        if (!resp.ok) {
          setError(json?.error || "Could not load drafts. Try again.");
          setDrafts([]);
          return;
        }

        setDrafts((json?.drafts ?? []) as Draft[]);
      } catch (err) {
        console.error("DRAFTS INIT ERROR:", err);
        if (!cancelled) setError("Could not load drafts. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleDeleteDraft(id: string) {
    const ok = confirm("Delete this draft?");
    if (!ok) return;

    try {
      const resp = await fetch("/api/messages/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        alert(json?.error || "Failed to delete draft.");
        return;
      }

      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("DRAFT DELETE ERROR:", err);
      alert("Failed to delete draft.");
    }
  }

  if (loading) {
    return <main className="p-6 text-center">Loading drafts…</main>;
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <button
        onClick={() => router.push("/")}
        className="mb-4 text-sm text-slate-600 hover:underline"
      >
        ← Back to Home
      </button>

      <h1 className="text-2xl font-bold mb-4">Your Drafts</h1>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {drafts.length === 0 && !error && (
        <p className="text-slate-500">No drafts saved yet.</p>
      )}

      <div className="flex flex-col gap-4">
        {drafts.map((d) => {
          const created = d.created_at ? new Date(d.created_at).toLocaleString() : "";

          return (
            <div key={d.id} className="border p-4 rounded-2xl bg-white shadow-sm">
              <p className="text-xs text-slate-400 mb-2">{created}</p>

              {d.original && (
                <p className="mt-1 text-sm">
                  <strong>Original:</strong> {d.original}
                </p>
              )}

              {d.soft_rewrite && (
                <p className="mt-2 text-sm">
                  <strong>Soft:</strong> {d.soft_rewrite}
                </p>
              )}

              {d.calm_rewrite && (
                <p className="mt-2 text-sm">
                  <strong>Calm:</strong> {d.calm_rewrite}
                </p>
              )}

              {d.clear_rewrite && (
                <p className="mt-2 text-sm">
                  <strong>Clear:</strong> {d.clear_rewrite}
                </p>
              )}

              <button
                onClick={() => handleDeleteDraft(d.id)}
                className="mt-4 text-xs text-red-600 underline"
              >
                Delete draft
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}