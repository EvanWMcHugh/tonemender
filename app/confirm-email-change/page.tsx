"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function ConfirmEmailChangePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirected = useRef(false);

  const token = searchParams.get("token");

  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;

    const encoded = token ? encodeURIComponent(token) : null;

    if (encoded) {
      router.replace(`/(auth)/confirm?type=email-change&token=${encoded}`);
    } else {
      router.replace("/(auth)/confirm?type=email-change");
    }
  }, [token, router]);

  return (
    <main
      className="min-h-screen flex items-center justify-center bg-white"
      role="status"
      aria-live="polite"
    >
      <p className="text-center text-slate-700">Redirecting…</p>
    </main>
  );
}