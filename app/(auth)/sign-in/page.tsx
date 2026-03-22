import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/server-auth";
import SignInForm from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign In – ToneMender",
  description: "Sign in to your ToneMender account.",
};

export default async function SignInPage() {
  const user = await getCurrentUser();

  if (user?.id) {
    redirect("/");
  }

  return <SignInForm />;
}