import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/server-auth";
import UpgradeClient from "./UpgradeClient";

export const metadata: Metadata = {
  title: "Upgrade to Pro – ToneMender",
  description:
    "Upgrade to ToneMender Pro for unlimited rewrites, tone control, and premium features.",
};

export default async function UpgradePage() {
  const user = await getCurrentUser();

  if (!user?.id) {
    redirect("/sign-in");
  }

  if (user.isPro) {
    redirect("/");
  }

  return <UpgradeClient />;
}