import type { Metadata } from "next";
import { connection } from "next/server";
import { requireAdmin } from "@/services/admin-auth";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await connection();
  const admin = await requireAdmin();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <p className="text-sm font-medium text-primary">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Admin dashboard</h1>
        <p className="mt-2 text-muted-foreground">Admin access is verified for {admin.email ?? "this account"}.</p>
      </header>
      <p className="mt-8 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Moderation tools will be introduced in a later phase.
      </p>
    </main>
  );
}
