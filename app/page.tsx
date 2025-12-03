"use client";

import LogoutButton from "./components/LogoutButton";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(!!data.session);
    });
  }, []);

  return (
    <main style={{ padding: "40px", maxWidth: "600px", margin: "auto" }}>
      {/* Logout button only when logged in */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {loggedIn && <LogoutButton />}
      </div>

      <h1 style={{ fontSize: "36px", fontWeight: "bold" }}>ToneMender</h1>

      <p style={{ marginTop: "20px", fontSize: "18px", lineHeight: "1.6" }}>
        ToneMender transforms emotionally charged or unclear messages into
        healthy, relationship-safe communication.
      </p>

      <p style={{ marginTop: "20px", opacity: 0.8, lineHeight: "1.6" }}>
        Get instant Soft, Calm, and Clear AI-powered rewrites tailored to your
        recipient.
      </p>

      {/* If logged in → show full menu */}
      {loggedIn ? (
        <div style={{ marginTop: "40px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <Link
            href="/rewrite"
            style={{
              padding: "10px 16px",
              background: "#2563eb",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
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
              textDecoration: "none",
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
              textDecoration: "none",
            }}
          >
            Account
          </Link>

          <Link
            href="/upgrade"
            style={{
              padding: "10px 16px",
              background: "#d97706",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Upgrade
          </Link>
        </div>
      ) : (
        // If logged out → show sign in/up
        <div style={{ marginTop: "40px" }}>
          <Link
            href="/sign-in"
            style={{
              marginRight: "16px",
              padding: "10px 16px",
              background: "#111827",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Sign In
          </Link>

          <Link
            href="/sign-up"
            style={{
              padding: "10px 16px",
              background: "#10b981",
              color: "white",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Sign Up
          </Link>
        </div>
      )}

      <p style={{ marginTop: "40px", fontSize: "16px" }}>
        For customer support: support@tonemender.app
      </p>
    </main>
  );
}
// force-rebuild