"use client";

import { useRouter } from "next/navigation";

export const metadata = {
  title: "Privacy Policy | ToneMender",
  description:
    "Privacy Policy for ToneMender, the AI relationship and tone assistant.",
};

export default function PrivacyPage() {
  const router = useRouter();
  return (
    <main className="bg-white">
      <div className="max-w-3xl mx-auto px-6 py-14 text-gray-800 leading-relaxed">
        <button
  onClick={() => router.back()}
  className="inline-block mb-6 text-sm text-gray-600 hover:underline"
>
  ← Back
</button>
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">
          Last updated: December 2025
        </p>

        <p>
          ToneMender ("we", "our", or "us") respects your privacy and is committed
          to protecting your personal data. This Privacy Policy explains how we
          collect, use, store, and safeguard information when you use
          ToneMender.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t">
          1. Information We Collect
        </h2>

        <p className="mt-4 font-medium">Information you provide:</p>
        <ul className="list-disc pl-6 mt-2">
          <li>Email address and account details</li>
          <li>Messages submitted for rewriting or tone analysis</li>
          <li>Subscription and plan status</li>
        </ul>

        <p className="mt-4 font-medium">Information collected automatically:</p>
        <ul className="list-disc pl-6 mt-2">
          <li>Usage and interaction data</li>
          <li>Device, IP address, and browser data</li>
          <li>Analytics collected via Vercel Analytics</li>
        </ul>

        <h2 className="text-xl font-semibold pt-8 border-t">
          2. How We Use Your Information
        </h2>

        <ul className="list-disc pl-6 mt-4">
          <li>Operate and maintain the ToneMender service</li>
          <li>Process AI-powered message rewrites</li>
          <li>Improve features and performance</li>
          <li>Prevent abuse and ensure security</li>
        </ul>

        <h2 className="text-xl font-semibold pt-8 border-t">
          3. Message Data & AI Processing
        </h2>
        <p className="mt-4">
          Messages you submit are stored long term and processed using artificial
          intelligence services, including OpenAI. We do not claim ownership of
          your content and do not sell personal data.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t">
          4. Data Storage & Security
        </h2>
        <p className="mt-4">
          Data is stored using Supabase infrastructure. While we implement
          reasonable safeguards, no system is completely secure.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t">
          5. Third-Party Services
        </h2>
        <ul className="list-disc pl-6 mt-4">
          <li>Supabase – authentication and database</li>
          <li>OpenAI – AI message processing</li>
          <li>Stripe – subscription payments</li>
          <li>Vercel – hosting and analytics</li>
        </ul>

        <h2 className="text-xl font-semibold pt-8 border-t">
          6. Your Rights
        </h2>
        <p className="mt-4">
          You may access, update, or delete your account at any time directly
          within the app.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t">
          7. Contact
        </h2>
        <p className="mt-4">Email: support@tonemender.com</p>
      </div>
    </main>
  );
}