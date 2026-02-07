"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function ConfirmEmailChangePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  useEffect(() => {
    // Redirect to the canonical unified confirm page
    const t = token ? encodeURIComponent(token) : "";
    router.replace(t ? `/confirm?type=email-change&token=${t}` : "/confirm?type=email-change");
  }, [token, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <p className="text-center text-slate-700">Redirecting…</p>
    </main>
  );
}