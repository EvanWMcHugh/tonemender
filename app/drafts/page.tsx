"use client";

import { useEffect, useMemo, useState } from "react";
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

type LoadState = "loading" | "ready" | "error";

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function normalizeDraft(d: Draft) {
  return {
    ...d,
    created_at: d.created_at ?? "",
    original: d.original ?? null,
    tone: d.tone ?? null,
    soft_rewrite: d.soft_rewrite ?? null,
    calm_rewrite: d.calm_rewrite ?? null,
    clear_rewrite: d.clear_rewrite ?? null,
  };
}

export default function DraftsPage() {
  const router = useRouter();

  const [state, setState] = useState<LoadState>("loading");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedDrafts = useMemo(() => {
    // newest first; stable if date parse fails
    return [...drafts].sort((a, b) => {
      const ta = Date.parse(a.created_at || "");
      const tb = Date.parse(b.created_at || "");
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return tb - ta;
    });
  }, [drafts]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setState("loading");
      setError("");

      try {
        // ✅ cookie-auth session check
        const meResp = await fetch("/api/me", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        const meJson = await meResp.json().catch(() => ({ user: null }));

        if (!meJson?.user?.id) {
          router.replace("/sign-in?error=not-authenticated");
          return;
        }

        // ✅ fetch drafts via server route
        const resp = await fetch("/api/messages", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        const json = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          setDrafts([]);
          setError(json?.error || "Could not load drafts. Try again.");
          setState("error");
          return;
        }

        const nextDrafts = Array.isArray(json?.drafts) ? (json.drafts as Draft[]) : [];
        setDrafts(nextDrafts.map(normalizeDraft));
        setState("ready");
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("DRAFTS LOAD ERROR:", err);
        setDrafts([]);
        setError("Could not load drafts. Try again.");
        setState("error");
      }
    }

    load();

    return () => controller.abort();
  }, [router]);

  async function handleDeleteDraft(id: string) {
    if (deletingId) return; // prevent multi-delete spam
    const ok = confirm("Delete this draft? This can’t be undone.");
    if (!ok) return;

    setDeletingId(id);

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
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <button
        onClick={() => router.push("/")}
        className="mb-4 text-sm text-slate-600 hover:underline"
      >
        ← Back to Home
      </button>

      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Your Drafts</h1>
          <p className="text-sm text-slate-500 mt-1">
            Saved rewrites across tones. Newest drafts appear first.
          </p>
        </div>

        <button
          onClick={() => router.refresh?.()}
          className="text-sm rounded-xl border bg-white px-3 py-2 shadow-sm hover:bg-slate-50"
          aria-label="Refresh drafts"
        >
          Refresh
        </button>
      </div>

      {state === "loading" && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-center text-sm text-slate-600">Loading drafts…</p>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {state !== "loading" && !error && sortedDrafts.length === 0 && (
        <div className="rounded-2xl border bg-white p-6 shadow-sm text-center">
          <p className="text-slate-700 font-medium">No drafts saved yet.</p>
          <p className="text-sm text-slate-500 mt-1">
            Create a rewrite and tap “Save draft” to see it here.
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-white text-sm hover:opacity-90"
          >
            Rewrite something
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {sortedDrafts.map((d) => {
          const created = formatDateTime(d.created_at);
          const deleting = deletingId === d.id;

          return (
            <article
              key={d.id}
              className="border p-4 rounded-2xl bg-white shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">{created || "—"}</p>
                  {d.tone && (
                    <p className="text-xs text-slate-500 mt-1">
                      Tone: <span className="font-medium">{d.tone}</span>
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleDeleteDraft(d.id)}
                  disabled={!!deletingId}
                  className={[
                    "shrink-0 text-xs rounded-xl border px-3 py-2",
                    deleting
                      ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                      : "bg-white text-red-600 border-red-200 hover:bg-red-50",
                  ].join(" ")}
                  aria-label="Delete draft"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>

              {d.original && (
                <section className="mt-3">
                  <p className="text-sm text-slate-500 font-medium mb-1">
                    Original
                  </p>
                  <p className="text-sm text-slate-900 whitespace-pre-wrap">
                    {d.original}
                  </p>
                </section>
              )}

              {(d.soft_rewrite || d.calm_rewrite || d.clear_rewrite) && (
                <section className="mt-4">
                  <p className="text-sm text-slate-500 font-medium mb-2">
                    Rewrites
                  </p>

                  <div className="flex flex-col gap-3">
                    {d.soft_rewrite && (
                      <div className="rounded-2xl border bg-slate-50 p-3">
                        <p className="text-xs text-slate-500 font-semibold mb-1">
                          Soft
                        </p>
                        <p className="text-sm text-slate-900 whitespace-pre-wrap">
                          {d.soft_rewrite}
                        </p>
                      </div>
                    )}

                    {d.calm_rewrite && (
                      <div className="rounded-2xl border bg-slate-50 p-3">
                        <p className="text-xs text-slate-500 font-semibold mb-1">
                          Calm
                        </p>
                        <p className="text-sm text-slate-900 whitespace-pre-wrap">
                          {d.calm_rewrite}
                        </p>
                      </div>
                    )}

                    {d.clear_rewrite && (
                      <div className="rounded-2xl border bg-slate-50 p-3">
                        <p className="text-xs text-slate-500 font-semibold mb-1">
                          Clear
                        </p>
                        <p className="text-sm text-slate-900 whitespace-pre-wrap">
                          {d.clear_rewrite}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}