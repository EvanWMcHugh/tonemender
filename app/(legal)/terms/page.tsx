import type { Metadata } from "next";
import BackButton from "../../components/BackButton";

export const metadata: Metadata = {
  title: "Terms of Service | ToneMender",
  description:
    "Terms of Service for ToneMender, the AI relationship and tone assistant.",
};

export default function TermsPage() {
  return (
    <main className="bg-white">
      <div className="max-w-3xl mx-auto px-6 py-14 text-gray-800 leading-relaxed">
        <BackButton fallbackHref="/(marketing)/landing" />

        <header className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500">Last updated: December 2025</p>
        </header>

        <p>
          These Terms of Service ("Terms") govern your use of ToneMender. By
          accessing or using the service, you agree to be bound by these Terms.
          If you do not agree to these Terms, you may not use the service.
        </p>

        <section>
          <h2 className="text-xl font-semibold pt-8 border-t mt-8">
            1. Service Description
          </h2>
          <p className="mt-4">
            ToneMender is an AI-powered tool designed to help improve written
            communication by adjusting tone and clarity. ToneMender does not
            provide legal, medical, therapeutic, or professional advice of any
            kind.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold pt-8 border-t mt-8">
            2. Account Responsibility
          </h2>
          <p className="mt-4">
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activity that occurs under your
            account. You agree to notify us immediately if you become aware of
            any unauthorized access or use of your account.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold pt-8 border-t mt-8">
            3. AI Output Disclaimer
          </h2>
          <p className="mt-4">
            AI-generated messages may be inaccurate, incomplete, or
            inappropriate for certain situations. You are solely responsible for
            reviewing and deciding whether to use any AI-generated output.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold pt-8 border-t mt-8">
            4. Subscriptions &amp; Payments
          </h2>
          <p className="mt-4">
            Paid plans and subscriptions are processed through Stripe. Fees are
            billed in advance and are generally non-refundable except where
            required by applicable law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold pt-8 border-t mt-8">
            5. Acceptable Use
          </h2>
          <ul className="list-disc pl-6 mt-4 space-y-1">
            <li>No unlawful, harmful, or fraudulent activity</li>
            <li>No harassment, abuse, or exploitation of others</li>
            <li>No attempts to disrupt, damage, or interfere with the service</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold pt-8 border-t mt-8">
            6. Termination
          </h2>
          <p className="mt-4">
            We reserve the right to suspend or terminate access to ToneMender at
            any time if these Terms are violated or the service is misused.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold pt-8 border-t mt-8">
            7. Limitation of Liability
          </h2>
          <p className="mt-4">
            ToneMender is provided on an “as is” and “as available” basis. To
            the maximum extent permitted by law, we are not liable for any
            indirect, incidental, or consequential damages resulting from the
            use of the service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold pt-8 border-t mt-8">8. Contact</h2>
          <p className="mt-4">
            If you have questions about these Terms, you can contact us at:
          </p>
          <p className="mt-2 font-medium">support@tonemender.com</p>
        </section>
      </div>
    </main>
  );
}