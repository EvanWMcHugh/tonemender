import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px] text-center">
        <h1 className="text-2xl font-bold mb-4">Check your email</h1>

        <p className="text-sm mb-4 text-slate-700">
          We just sent you a confirmation link. Please verify your email to
          activate your account.
        </p>

        <p className="text-sm text-slate-500">
          If you don’t see it, check your spam or junk folder.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center w-full rounded-xl bg-blue-600 text-white px-4 py-3 text-sm font-semibold hover:bg-blue-500 transition"
          >
            Go to Sign In
          </Link>

          <Link
            href="/landing"
            className="text-sm text-slate-600 hover:underline"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}