import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  return <div className="px-4 py-14 sm:py-20"><AuthForm kind="reset-password" statusMessage={status === "error" ? "That password reset link is invalid or expired. Request a new one to continue." : undefined} /></div>;
}
