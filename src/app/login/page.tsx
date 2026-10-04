import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  const candidate = typeof params.next === "string" ? params.next : "";
  const returnTo = candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\") ? candidate : undefined;
  return <div className="px-4 py-14 sm:py-20"><AuthForm kind="login" returnTo={returnTo} /></div>;
}
