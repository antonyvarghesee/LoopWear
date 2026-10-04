import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const failed = status === "error";
  const verified = status === "success";
  return (
    <div className="px-4 py-14 sm:py-20">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">{failed ? "!" : "✓"}</div>
        <h1 className="text-2xl font-semibold tracking-tight">{failed ? "Link unavailable" : verified ? "Email verified" : "Check your email"}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{failed ? "This verification link is invalid or expired. Request a new one or sign in if your email is already verified." : verified ? "Your email address is confirmed. Continue to your LoopWear account." : "Use the verification link we sent to your email to finish setting up your LoopWear account."}</p>
        <Link href={failed ? "/login" : verified ? "/" : "/login"} className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/85">{failed ? "Go to sign in" : verified ? "Continue to LoopWear" : "Go to sign in"}</Link>
        {failed && <p className="mt-4 text-sm text-muted-foreground">Need an account? <Link href="/register" className="font-medium text-primary hover:underline">Register</Link>.</p>}
      </section>
    </div>
  );
}
