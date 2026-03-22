import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/server-auth";
import SignUpForm from "./SignUpForm";

export const metadata: Metadata = {
  title: "Sign Up – ToneMender",
  description: "Create your ToneMender account.",
};

export default async function SignUpPage() {
  const user = await getCurrentUser();

  if (user?.id) {
    redirect("/");
  }

  return <SignUpForm />;
}