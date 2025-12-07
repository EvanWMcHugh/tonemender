"use client";

import { useRouter } from "next/navigation";

export const metadata = {
  title: "Terms of Service | ToneMender",
  description:
    "Terms of Service for ToneMender, the AI relationship and tone assistant.",
};

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">
          Last updated: December 2025
        </p>

        <p>
          These Terms govern your use of ToneMender. By accessing or using the
          service, you agree to these Terms.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t">
          1. Service Description
        </h2>
        <p className="mt-4">
          ToneMender is an AI-powered tool designed to help improve written
          communication. It does not provide legal, medical, or therapeutic
          advice.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t">
          2. Account Responsibility
        </h2>
        <p className="mt-4">
          You are responsible for maintaining the confidentiality of your
          account and all activity under it.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t">
          3. AI Output Disclaimer
        </h2>
        <p className="mt-4">
          AI-generated messages may be inaccurate or inappropriate. You assume
          full responsibility for their use.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t">
          4. Subscriptions & Payments
        </h2>
        <p className="mt-4">
          Paid plans are processed via Stripe. Fees are non-refundable unless
          required by law.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t">
          5. Acceptable Use
        </h2>
        <ul className="list-disc pl-6 mt-4">
          <li>No unlawful activity</li>
          <li>No abuse or exploitation</li>
          <li>No platform interference</li>
        </ul>

        <h2 className="text-xl font-semibold pt-8 border-t">
          6. Termination
        </h2>
        <p className="mt-4">
          We may suspend or terminate access for violations of these Terms.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t">
          7. Limitation of Liability
        </h2>
        <p className="mt-4">
          ToneMender is provided “as is.” We are not liable for indirect or
          consequential damages.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t">
          8. Contact
        </h2>
        <p className="mt-4">Email: support@tonemender.com</p>
      </div>
    </main>
  );
}