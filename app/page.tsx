"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import LogoutButton from "./components/LogoutButton";
import Link from "next/link";

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      setLoggedIn(!!user);

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_pro")
          .eq("id", user.id)
          .single();

        if (profile?.is_pro) setIsPro(true);
      }
    }

    load();
  }, []);

  return (
    <main style={{ padding: "40px", maxWidth: "600px", margin: "auto" }}>
      {loggedIn && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <LogoutButton />
        </div>
      )}

      <h1 style={{ fontSize: "36px", fontWeight: "bold" }}>ToneMender</h1>

      <p style={{ marginTop: "20px", fontSize: "18px", lineHeight: "1.6" }}>
        ToneMender transforms emotionally charged messages into healthy,
        relationship-safe communication.
      </p>

      <div style={{ marginTop: "40px", display: "flex", gap: "16px" }}>
        <Link
          href="/rewrite"
          style={{
            padding: "10px 16px",
            background: "#2563eb",
            color: "white",
            borderRadius: "6px",
          }}
        >
          Rewrite Message
        </Link>

        <Link
          href="/drafts"
          style={{
            padding: "10px 16px",
            background: "#6b7280",
            color: "white",
            borderRadius: "6px",
          }}
        >
          Drafts
        </Link>

        <Link
          href="/account"
          style={{
            padding: "10px 16px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "6px",
          }}
        >
          Account
        </Link>
      </div>

      {/* Show Upgrade button ONLY if logged in AND not Pro */}
      {loggedIn && !isPro && (
        <div style={{ marginTop: "30px" }}>
          <Link
            href="/upgrade"
            style={{
              padding: "10px 16px",
              background: "#10b981",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Upgrade to Pro
          </Link>
        </div>
      )}

      {/* Show login/signup only if logged OUT */}
      {!loggedIn && (
        <div style={{ marginTop: "40px" }}>
          <Link
            href="/sign-in"
            style={{
              marginRight: "16px",
              padding: "8px 14px",
              background: "#111827",
              color: "white",
              borderRadius: "6px",
            }}
          >
            Sign In
          </Link>

          <Link
            href="/sign-up"
            style={{
              padding: "8px 14px",
              background: "#10b981",
              color: "white",
              borderRadius: "6px",
            }}
          >
            Sign Up
          </Link>
        </div>
      )}
    </main>
  );
}