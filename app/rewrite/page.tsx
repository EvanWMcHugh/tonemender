import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/server-auth";
import RewriteClient from "./RewriteClient";

export const metadata: Metadata = {
  title: "Rewrite Message – ToneMender",
  description:
    "Rewrite emotionally charged messages into calm, clear, relationship-safe communication.",
};

export default async function RewritePage() {
  const user = await getCurrentUser();

  if (!user?.id) {
    redirect("/sign-in");
  }

  return <RewriteClient user={user} />;
}