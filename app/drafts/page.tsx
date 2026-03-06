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

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString();
}

function normalizeDraft(draft: Draft) {
  return {
    ...draft,
    created_at: draft.created_at ?? "",
    original: draft.original ?? null,
    tone: draft.tone ?? null,
    soft_rewrite: draft.soft_rewrite ?? null,
    calm_rewrite: draft.calm_rewrite ?? null,
    clear_rewrite: draft.clear_rewrite ?? null,
  };
}

export default function DraftsPage() {
  const router = useRouter();

  const [state, setState] = useState<LoadState>("loading");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedDrafts = useMemo(() => {
    return [...drafts].sort((a, b) => {
      const aTime = Date.parse(a.created_at || "");
      const bTime = Date.parse(b.created_at || "");

      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;

      return bTime - aTime;
    });
  }, [drafts]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setState("loading");
      setError("");

      try {
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
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setDrafts([]);
        setError("Could not load drafts. Try again.");
        setState("error");
      }
    }

    load();

    return () => controller.abort();
  }, [router]);

  async function handleDeleteDraft(id: string) {
    if (deletingId) return;

    const confirmed = confirm("Delete this draft? This can’t be undone.");
    if (!confirmed) return;

    setDeletingId(id);

    try {
      const resp = await fetch("/api/messages/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        alert(json?.error || "Failed to delete draft.");
        return;
      }

      setDrafts((prev) => prev.filter((draft) => draft.id !== id));
    } catch {
      alert("Failed to delete draft.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <button
        onClick={() => router.push("/")}
        className="mb-4 text-sm text-slate-600 hover:underline"
      >
        ← Back to Home
      </button>

      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Your Drafts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Saved rewrites across tones. Newest drafts appear first.
          </p>
        </div>

        <button
          onClick={() => router.refresh()}
          className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
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
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {state !== "loading" && !error && sortedDrafts.length === 0 && (
        <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
          <p className="font-medium text-slate-700">No drafts saved yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Create a rewrite and tap “Save draft” to see it here.
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm text-white hover:opacity-90"
          >
            Rewrite something
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {sortedDrafts.map((draft) => {
          const created = formatDateTime(draft.created_at);
          const deleting = deletingId === draft.id;

          return (
            <article
              key={draft.id}
              className="rounded-2xl border bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">{created || "—"}</p>

                  {draft.tone && (
                    <p className="mt-1 text-xs text-slate-500">
                      Tone: <span className="font-medium">{draft.tone}</span>
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleDeleteDraft(draft.id)}
                  disabled={Boolean(deletingId)}
                  className={[
                    "shrink-0 rounded-xl border px-3 py-2 text-xs",
                    deleting
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : "border-red-200 bg-white text-red-600 hover:bg-red-50",
                  ].join(" ")}
                  aria-label="Delete draft"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>

              {draft.original && (
                <section className="mt-3">
                  <p className="mb-1 text-sm font-medium text-slate-500">Original</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-900">
                    {draft.original}
                  </p>
                </section>
              )}

              {(draft.soft_rewrite || draft.calm_rewrite || draft.clear_rewrite) && (
                <section className="mt-4">
                  <p className="mb-2 text-sm font-medium text-slate-500">Rewrites</p>

                  <div className="flex flex-col gap-3">
                    {draft.soft_rewrite && (
                      <div className="rounded-2xl border bg-slate-50 p-3">
                        <p className="mb-1 text-xs font-semibold text-slate-500">Soft</p>
                        <p className="whitespace-pre-wrap text-sm text-slate-900">
                          {draft.soft_rewrite}
                        </p>
                      </div>
                    )}

                    {draft.calm_rewrite && (
                      <div className="rounded-2xl border bg-slate-50 p-3">
                        <p className="mb-1 text-xs font-semibold text-slate-500">Calm</p>
                        <p className="whitespace-pre-wrap text-sm text-slate-900">
                          {draft.calm_rewrite}
                        </p>
                      </div>
                    )}

                    {draft.clear_rewrite && (
                      <div className="rounded-2xl border bg-slate-50 p-3">
                        <p className="mb-1 text-xs font-semibold text-slate-500">Clear</p>
                        <p className="whitespace-pre-wrap text-sm text-slate-900">
                          {draft.clear_rewrite}
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