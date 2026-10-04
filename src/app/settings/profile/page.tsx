import type { Metadata } from "next";
import { connection } from "next/server";
import { ProfileForm } from "@/components/profile/profile-form";
import { requireAuth, getCurrentProfile } from "@/services/auth";

export const metadata: Metadata = { title: "Profile settings" };

export default async function ProfileSettingsPage() {
  await connection();
  const user = await requireAuth();
  const profile = await getCurrentProfile();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-7"><p className="text-sm font-medium text-primary">Account settings</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Profile</h1><p className="mt-2 text-muted-foreground">Manage the details other members see.</p></div>
      {profile ? <ProfileForm profile={profile} email={user.email ?? ""} /> : <div role="alert" className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Your profile could not be loaded. Please try again later.</div>}
    </div>
  );
}
