import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/server-auth";
import DraftsClient from "./DraftsClient";

export const metadata: Metadata = {
  title: "Your Drafts – ToneMender",
  description: "View and manage your saved ToneMender drafts.",
};

export default async function DraftsPage() {
  const user = await getCurrentUser();

  if (!user?.id) {
    redirect("/sign-in");
  }

  return <DraftsClient />;
}