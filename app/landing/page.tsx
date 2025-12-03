"use client";

import LogoutButton from "../components/LogoutButton";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main style={{ padding: "40px", maxWidth: "600px", margin: "auto" }}>
      {/* Logout button – only visible on landing */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <LogoutButton />
      </div>

      <h1 style={{ fontSize: "36px", fontWeight: "bold" }}>ToneMender</h1>

      <p style={{ marginTop: "20px", fontSize: "18px", lineHeight: "1.6" }}>
        ToneMender transforms emotionally charged or unclear messages into
        healthy, relationship-safe communication. Designed to prevent
        misunderstandings, reduce conflict, and promote clarity — in
        relationships, friendships, and daily life.
      </p>

      <p style={{ marginTop: "20px", opacity: 0.8, lineHeight: "1.6" }}>
        Get instant Soft, Calm, and Clear AI-powered rewrites tailored to your
        recipient so your message stays kind, honest, and effective.
      </p>

      {/* Navigation buttons */}
      <div style={{ marginTop: "40px", display: "flex", gap: "16px" }}>
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
      </div>

      <p style={{ marginTop: "40px", fontSize: "16px" }}>
        For customer support: support@tonemender.app
      </p>

      <div style={{ marginTop: "40px" }}>
        <Link
          href="/sign-in"
          style={{
            marginRight: "16px",
            padding: "8px 14px",
            background: "#111827",
            color: "white",
            borderRadius: "6px",
            textDecoration: "none",
            fontSize: "14px",
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
            textDecoration: "none",
            fontSize: "14px",
          }}
        >
          Sign Up
        </Link>
      </div>
    </main>
  );
}