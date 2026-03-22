import type { Metadata } from "next";
import ResetPasswordClient from "./ResetPasswordClient";

export const metadata: Metadata = {
  title: "Reset Password – ToneMender",
  description: "Set a new password for your ToneMender account.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}