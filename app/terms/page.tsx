import type { Metadata } from "next";
import BackButton from "./BackButton";

export const metadata: Metadata = {
  title: "Terms of Service | ToneMender",
  description: "Terms of Service for ToneMender, the AI relationship and tone assistant.",
};

export default function TermsPage() {
  return (
    <main className="bg-white">
      <div className="max-w-3xl mx-auto px-6 py-14 text-gray-800 leading-relaxed">
        <BackButton fallbackHref="/landing" />

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: December 2025</p>

        <p>
          These Terms govern your use of ToneMender. By accessing or using the
          service, you agree to be bound by these Terms.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t mt-8">
          1. Service Description
        </h2>
        <p className="mt-4">
          ToneMender is an AI-powered tool designed to help improve written
          communication by adjusting tone and clarity. It does not provide
          legal, medical, therapeutic, or professional advice of any kind.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t mt-8">
          2. Account Responsibility
        </h2>
        <p className="mt-4">
          You are responsible for maintaining the confidentiality of your
          account credentials and for all activity that occurs under your
          account. You agree to notify us immediately of any unauthorized use.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t mt-8">
          3. AI Output Disclaimer
        </h2>
        <p className="mt-4">
          AI-generated messages may be inaccurate, incomplete, or inappropriate
          for certain situations. You are solely responsible for reviewing and
          deciding whether to use any AI-generated output.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t mt-8">
          4. Subscriptions &amp; Payments
        </h2>
        <p className="mt-4">
          Paid plans and subscriptions are processed through Stripe. Fees are
          billed in advance and are non-refundable except where required by
          applicable law.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t mt-8">
          5. Acceptable Use
        </h2>
        <ul className="list-disc pl-6 mt-4 space-y-1">
          <li>No unlawful, harmful, or fraudulent activity</li>
          <li>No harassment, abuse, or exploitation of others</li>
          <li>No attempts to disrupt or interfere with the service</li>
        </ul>

        <h2 className="text-xl font-semibold pt-8 border-t mt-8">
          6. Termination
        </h2>
        <p className="mt-4">
          We reserve the right to suspend or terminate your access to
          ToneMender at any time if you violate these Terms or misuse the
          service.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t mt-8">
          7. Limitation of Liability
        </h2>
        <p className="mt-4">
          ToneMender is provided on an “as is” and “as available” basis. To the
          maximum extent permitted by law, we are not liable for any indirect,
          incidental, or consequential damages arising from your use of the
          service.
        </p>

        <h2 className="text-xl font-semibold pt-8 border-t mt-8">8. Contact</h2>
        <p className="mt-4">Email: support@tonemender.com</p>
      </div>
    </main>
  );
}