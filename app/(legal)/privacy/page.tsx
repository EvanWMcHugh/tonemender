import type { Metadata } from "next";
import BackButton from "@/components/BackButton";

export const metadata: Metadata = {
  title: "Privacy Policy – ToneMender",
  description:
    "Learn how ToneMender collects, uses, and protects your data when using our AI message rewriting service.",
};

export default function PrivacyPage() {
  return (
    <main className="bg-white">
      <div className="max-w-3xl mx-auto px-6 py-14 text-gray-800 leading-relaxed">
        <BackButton fallbackHref="/landing" />

        <header className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500">Last updated: March 2026</p>
          <p className="text-sm text-gray-500 mt-2">
            This policy describes how ToneMender collects, uses, and safeguards
            information when you use the service.
          </p>
        </header>

        <section className="space-y-4">
          <p>
            ToneMender (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;)
            respects your privacy and is committed to protecting your personal
            data. This Privacy Policy explains how we collect, use, store, and
            safeguard information when you use ToneMender.
          </p>

          <div className="rounded-2xl border bg-gray-50 p-4 text-sm text-gray-700">
            <p className="font-medium mb-1">Quick summary</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                We use your data to provide the app, improve reliability, and
                prevent abuse.
              </li>
              <li>
                Messages are processed by AI providers (including OpenAI) to
                generate rewrites.
              </li>
              <li>
                We don’t sell personal data, and you can delete your account in
                the app.
              </li>
            </ul>
          </div>
        </section>

        <h2 className="text-xl font-semibold pt-8 border-t mt-10">
          1. Information We Collect
        </h2>

        <p className="mt-4 font-medium">Information you provide</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>Email address and account details</li>
          <li>Messages submitted for rewriting or tone analysis</li>
          <li>Subscription and plan status</li>
        </ul>

        <p className="mt-6 font-medium">Information collected automatically</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>Usage and interaction data</li>
          <li>Device, IP address, and browser data</li>
          <li>Analytics collected via Vercel Analytics</li>
        </ul>

        <h2 className="text-xl font-semibold pt-8 border-t mt-10">
          2. How We Use Your Information
        </h2>
        <ul className="list-disc pl-6 mt-4 space-y-1">
          <li>Operate and maintain the ToneMender service</li>
          <li>Process AI-powered message rewrites</li>
          <li>Improve features, usability, and performance</li>
          <li>Prevent abuse and ensure security</li>
          <li>Support billing and account management</li>
        </ul>

        <h2 className="text-xl font-semibold pt-8 border-t mt-10">
          3. Message Data &amp; AI Processing
        </h2>
        <p className="mt-4">
          Messages you submit are processed using artificial intelligence
          services, including OpenAI, to generate rewrites and tone suggestions.
          We do not claim ownership of your content and do not sell personal
          data. Your messages are processed only to generate rewrites and improve
          the service.
        </p>
        <p className="mt-4">
          If you choose to save drafts in the app, your messages and rewrites
          may be stored in your ToneMender account so you can view them later.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t mt-10">
          4. Data Storage &amp; Security
        </h2>
        <p className="mt-4">
          Data is stored using Supabase infrastructure. We implement reasonable
          safeguards to protect your information, but no system can be
          guaranteed 100% secure.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t mt-10">
          5. Third-Party Services
        </h2>
        <p className="mt-4">
          ToneMender relies on trusted vendors to operate the service. These
          providers may process data on our behalf to deliver functionality.
        </p>
        <ul className="list-disc pl-6 mt-4 space-y-1">
          <li>Supabase – database and infrastructure</li>
          <li>OpenAI – AI message processing</li>
          <li>Stripe – subscription payments</li>
          <li>Vercel – hosting and analytics</li>
        </ul>

        <h2 className="text-xl font-semibold pt-8 border-t mt-10">
          6. Your Rights
        </h2>
        <p className="mt-4">
          You may access, update, or delete your account at any time directly
          within the app. If you need help, contact us and we’ll assist.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t mt-10">
          7. Data Retention
        </h2>
        <p className="mt-4">
          We retain data only as long as necessary to provide the service and
          comply with legal obligations. You can delete your account at any time,
          which removes your associated data.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t mt-10">
          8. Contact
        </h2>
        <p className="mt-4">
          Email:{" "}
          <a
            href="mailto:support@tonemender.com"
            className="underline hover:opacity-80"
          >
            support@tonemender.com
          </a>
        </p>
      </div>
    </main>
  );
}