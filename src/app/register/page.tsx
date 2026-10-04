import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return <div className="px-4 py-14 sm:py-20"><AuthForm kind="register" /></div>;
}
