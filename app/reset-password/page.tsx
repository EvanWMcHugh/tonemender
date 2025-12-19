"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Turnstile from "react-turnstile";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
const [ready, setReady] = useState(false);

  useEffect(() => {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      setReady(true);   // ✅ session is now available
      setError("");
    }
  });

  return () => subscription.unsubscribe();
}, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!ready) {
  setError("Preparing secure reset session. Please wait a moment.");
  return;
}

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

  const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

  if (error) {
  setError(error.message);
  setCaptchaToken(null); // ⬅ force re-verify
  return;
}

    router.replace("/sign-in");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px]">
        <h1 className="text-2xl font-bold mb-4 text-center">
          Reset Password
        </h1>

        {error && <p className="text-red-500">{error}</p>}

        <form onSubmit={handleReset} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="New password"
            className="border p-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
         

          <input
            type="password"
            placeholder="Confirm password"
            className="border p-2 rounded"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />


          <Turnstile
  sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
  onSuccess={(token) => setCaptchaToken(token)}
/>

         <button
  type="submit"
  disabled={loading || !captchaToken}
  className="bg-blue-600 text-white p-2 rounded disabled:opacity-50"
>
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </main>
  );
}