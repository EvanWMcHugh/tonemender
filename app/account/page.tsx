import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/server-auth";
import AccountClient from "./AccountClient";

export const metadata: Metadata = {
  title: "Your Account – ToneMender",
  description:
    "Manage your ToneMender account, subscription, security settings, and usage.",
};

export default async function AccountPage() {
  const user = await getCurrentUser();

  if (!user?.id) {
    redirect("/sign-in");
  }

  return <AccountClient user={user} />;
}