"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState("Finishing…");

  useEffect(() => {
    async function run() {
      try {
        // If Supabase sends errors as query params
        const error = params.get("error");
        const errorDesc = params.get("error_description");
        if (error) {
          setStatus(errorDesc || error);
          return;
        }

        const code = params.get("code");

        // 1) PKCE flow: ?code=...
        if (code) {
          const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchErr) {
            setStatus(exchErr.message);
            return;
          }
        } else {
          // 2) Implicit/hash flow: #access_token=...
          // This consumes tokens from the URL hash and stores session.
          // If there's no hash, it usually just no-ops.
          // @ts-ignore - depending on types, supabase-js exposes this in v2
          const { error: urlErr } = await supabase.auth.getSessionFromUrl({
            storeSession: true,
          });
          if (urlErr) {
            setStatus(urlErr.message);
            return;
          }
        }

        // Optional: force-refresh user so UI updates quickly
        await supabase.auth.getUser();

        setStatus("Done. Redirecting…");
        router.replace("/account");
      } catch (e: any) {
        setStatus(e?.message || "Something went wrong.");
      }
    }

    run();
  }, [params, router]);

  return (
    <main className="p-8 text-center text-sm text-slate-600">
      {status}
    </main>
  );
}