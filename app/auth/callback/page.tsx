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
        const code = params.get("code");
        const error = params.get("error");
        const errorDesc = params.get("error_description");

        if (error) {
          setStatus(errorDesc || error);
          return;
        }

        // ✅ This finalizes email-change confirmations (and sign-in magic links)
        if (code) {
          const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchErr) {
            setStatus(exchErr.message);
            return;
          }
        }

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