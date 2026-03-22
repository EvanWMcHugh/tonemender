"use client";

import { useCallback, useEffect, useState } from "react";
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
  | { status: "ok"; data: DebugPayload }
  | { status: "error"; message: string };

function Badge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-full border bg-white px-2 py-0.5 text-[11px]">
      {text}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="break-words text-sm font-medium">{value}</div>
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
      type="button"
      onClick={copy}
      className="rounded-md border bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
      title="Copy"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function DebugClient() {
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const headers: Record<string, string> = {};
      const debugKey = process.env.NEXT_PUBLIC_DEBUG_KEY;

      if (debugKey) {
        headers["x-debug-key"] = debugKey;
      }

      const res = await fetch("/api/dev/debug/session", {
        method: "GET",
        cache: "no-store",
        headers,
      });

      const json = (await res.json().catch(() => null)) as DebugPayload | null;

      if (!res.ok || !json?.ok) {
        setState({
          status: "error",
          message: "Debug endpoint blocked or failed.",
        });
        return;
      }

      setState({ status: "ok", data: json });
    } catch (error: unknown) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <main className="p-6 text-sm text-slate-600">
        Loading debug session…
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="mx-auto max-w-xl p-6">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-red-600">❌ {state.message}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50"
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
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Debug Session (Dev Only)</h1>

        <div className="flex items-center gap-2">
          <Badge text={statusLabel} />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border bg-white p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Row label="Cookie present" value={data.sessionExists ? "Yes" : "No"} />
          <Row label="User email" value={data.user?.email ?? "—"} />
          <Row
            label="Plan"
            value={data.user?.isPro ? `Pro (${data.user?.planType ?? "—"})` : "Free"}
          />
          <Row label="Session expires" value={data.session?.expires_at ?? "—"} />
          <Row
            label="Session revoked"
            value={data.session?.revoked_at || "No"}
          />
          <Row label="Last seen" value={data.session?.last_seen_at ?? "—"} />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="break-all text-xs text-slate-500">
              <span className="font-semibold text-slate-700">User ID:</span>{" "}
              {data.user?.id ?? "—"}
            </div>
            {data.user?.id ? <CopyButton value={data.user.id} /> : null}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="break-all text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Session ID:</span>{" "}
              {data.session?.id ?? "—"}
            </div>
            {data.session?.id ? <CopyButton value={data.session.id} /> : null}
          </div>
        </div>

        {(status === "no-cookie" ||
          status === "missing-session" ||
          status === "revoked" ||
          status === "expired") && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/sign-in")}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500"
            >
              Go to Sign In
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-lg border bg-white px-3 py-2 text-xs hover:bg-slate-50"
            >
              Go Home
            </button>
          </div>
        )}
      </div>

      <pre className="overflow-auto rounded-xl border bg-slate-100 p-4 text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>

      <p className="mt-3 text-xs text-slate-500">
        ✅ Dev-only route. Does not expose token values.
      </p>
    </main>
  );
}