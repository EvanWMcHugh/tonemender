"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DebugPayload = {
  ok: boolean;
  env: "development";
  sessionExists: boolean;
  status:
    | "no-cookie"
    | "missing-session"
    | "revoked"
    | "expired"
    | "active"
    | "user-missing";
  session: {
    id: string;
    user_id: string;
    expires_at: string;
    last_seen_at?: string | null;
    revoked_at?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    device_name?: string | null;
  } | null;
  user: {
    id: string;
    email: string;
    isPro?: boolean;
    planType?: string | null;
    disabledAt?: string | null;
    deletedAt?: string | null;
    lastLoginAt?: string | null;
  } | null;
};

type ViewState =
  | { status: "loading" }
  | { status: "blocked" }
  | { status: "ok"; data: DebugPayload }
  | { status: "error"; message: string };

function Badge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-white">
      {text}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm font-medium break-words">{value}</div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 800);
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={copy}
      className="text-[11px] px-2 py-1 rounded-md border bg-white hover:bg-slate-50"
      title="Copy"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function DebugPage() {
  const router = useRouter();

  const isDev = useMemo(() => process.env.NODE_ENV === "development", []);
  const ranRef = useRef(false);
  const loadingRef = useRef(false);

  const [state, setState] = useState<ViewState>({ status: "loading" });

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!isDev) {
      setState({ status: "blocked" });
      router.replace("/");
    }
  }, [isDev, router]);

  const load = useCallback(async () => {
    if (!isDev) return;
    if (loadingRef.current) return;
    loadingRef.current = true;

    setState({ status: "loading" });

    try {
      const headers: Record<string, string> = {};

      // Optional: if you set DEBUG_KEY, also set NEXT_PUBLIC_DEBUG_KEY to send it
      // NEXT_PUBLIC_DEBUG_KEY=dev-super-secret
      const debugKey = process.env.NEXT_PUBLIC_DEBUG_KEY;
      if (debugKey) headers["x-debug-key"] = debugKey;

      const res = await fetch("/api/dev/debug/session", {
        method: "GET",
        cache: "no-store",
        headers,
      });

      const json = (await res.json().catch(() => null)) as DebugPayload | null;

      if (!res.ok || !json?.ok) {
        setState({ status: "error", message: "Debug endpoint blocked or failed." });
        return;
      }

      setState({ status: "ok", data: json });
    } catch (e: any) {
      setState({ status: "error", message: e?.message || "Unknown error" });
    } finally {
      loadingRef.current = false;
    }
  }, [isDev]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "blocked") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white p-6">
        <p className="text-slate-700">This page is disabled in production.</p>
      </main>
    );
  }

  if (state.status === "loading") {
    return <main className="p-6 text-sm text-slate-600">Loading debug session…</main>;
  }

  if (state.status === "error") {
    return (
      <main className="p-6 max-w-xl mx-auto">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-red-600 text-sm">❌ {state.message}</p>
          <button
            onClick={() => void load()}
            className="mt-3 text-xs px-3 py-2 rounded-lg border bg-white hover:bg-slate-50"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const data = state.data;
  const status = data.status;

  const statusLabel =
    status === "active"
      ? "Active"
      : status === "no-cookie"
      ? "No cookie"
      : status === "missing-session"
      ? "Cookie present, no DB session"
      : status === "revoked"
      ? "Revoked"
      : status === "expired"
      ? "Expired"
      : "User missing";

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h1 className="text-lg font-semibold">Debug Session (Dev Only)</h1>

        <div className="flex items-center gap-2">
          <Badge text={statusLabel} />
          <button
            onClick={() => void load()}
            className="text-xs px-3 py-2 rounded-lg border bg-white hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Primary card */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Row label="Cookie present" value={data.sessionExists ? "Yes" : "No"} />
          <Row label="User email" value={data.user?.email ?? "—"} />

          <Row
            label="Plan"
            value={data.user?.isPro ? `Pro (${data.user?.planType ?? "—"})` : "Free"}
          />

          <Row
            label="Session expires"
            value={data.session?.expires_at ?? "—"}
          />

          <Row
            label="Session revoked"
            value={data.session?.revoked_at ? data.session.revoked_at : "No"}
          />

          <Row
            label="Last seen"
            value={data.session?.last_seen_at ?? "—"}
          />
        </div>

        {/* IDs with copy */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500 break-all">
              <span className="font-semibold text-slate-700">User ID:</span>{" "}
              {data.user?.id ?? "—"}
            </div>
            {data.user?.id ? <CopyButton value={data.user.id} /> : null}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500 break-all">
              <span className="font-semibold text-slate-700">Session ID:</span>{" "}
              {data.session?.id ?? "—"}
            </div>
            {data.session?.id ? <CopyButton value={data.session.id} /> : null}
          </div>
        </div>

        {/* Helpful CTA */}
        {(status === "no-cookie" || status === "missing-session" || status === "revoked" || status === "expired") && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => router.push("/sign-in")}
              className="text-xs px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
            >
              Go to Sign In
            </button>
            <button
              onClick={() => router.push("/")}
              className="text-xs px-3 py-2 rounded-lg border bg-white hover:bg-slate-50"
            >
              Go Home
            </button>
          </div>
        )}
      </div>

      {/* Raw JSON */}
      <pre className="bg-slate-100 border rounded-xl p-4 text-xs overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>

      <p className="mt-3 text-xs text-slate-500">
        ✅ Dev-only route. Does not expose token values.
      </p>
    </main>
  );
}