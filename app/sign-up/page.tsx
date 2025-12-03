"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);
  setError("");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    setError(error.message);
    setLoading(false);
    return;
  }

  // ⚠️ Dev mode: Supabase automatically logs users in after signup
  if (data.session) {
    router.push("/");
    return;
  }

  // If email verification ever becomes enabled
  router.push("/auth/login");
}

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px]">
        <h1 className="text-2xl font-bold mb-4 text-center">Create Account</h1>

        {error && <p className="text-red-500">{error}</p>}

        <form onSubmit={handleSignup} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            className="border p-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="border p-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            disabled={loading}
            className="bg-blue-600 text-white p-2 rounded"
          >
            {loading ? "Creating..." : "Sign Up"}
          </button>
        </form>
      </div>
    </main>
  );
}