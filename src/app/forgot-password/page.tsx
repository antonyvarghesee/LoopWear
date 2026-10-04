import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return <div className="px-4 py-14 sm:py-20"><AuthForm kind="forgot-password" /></div>;
}
