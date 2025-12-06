"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ConfirmPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<
    "loading" | "success" | "error"
  >("loading");

  useEffect(() => {
    async function confirm() {
      if (!token) {
        setStatus("error");
        return;
      }

      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    }

    confirm();
  }, [token]);

  if (status === "loading") {
    return <p className="text-center mt-20">Confirming…</p>;
  }

  if (status === "success") {
    return (
      <p className="text-center mt-20 text-green-600 font-semibold">
        ✅ You’re in! Thanks for joining ToneMender.
      </p>
    );
  }

  return (
    <p className="text-center mt-20 text-red-600 font-semibold">
      ❌ This confirmation link is invalid or expired.
    </p>
  );
}