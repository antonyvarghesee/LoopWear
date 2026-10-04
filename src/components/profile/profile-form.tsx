"use client";

import { useActionState } from "react";
import { updateProfileAction, type FormActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { UserProfile } from "@/services/auth";

export function ProfileForm({ profile, email }: { profile: UserProfile; email: string }) {
  const [state, action, pending] = useActionState<FormActionState, FormData>(updateProfileAction, null);
  const error = (field: string) => state?.fieldErrors?.[field];
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-6"><h2 className="text-lg font-semibold">Your profile</h2><p className="mt-1 text-sm text-muted-foreground">Choose how you appear to the LoopWear community.</p></div>
      <form action={action} className="space-y-5" noValidate>
        <div className="space-y-1.5"><label htmlFor="email" className="text-sm font-medium">Email</label><Input id="email" value={email} readOnly disabled className="bg-muted/50" /><p className="text-xs text-muted-foreground">Email is managed through your sign-in account.</p></div>
        <div className="space-y-1.5"><label htmlFor="username" className="text-sm font-medium">Username</label><Input id="username" name="username" defaultValue={profile.username} autoComplete="username" required aria-invalid={Boolean(error("username"))} />{error("username") && <p className="text-xs text-destructive">{error("username")}</p>}</div>
        <div className="space-y-1.5"><label htmlFor="fullName" className="text-sm font-medium">Display name</label><Input id="fullName" name="fullName" defaultValue={profile.full_name ?? ""} autoComplete="name" aria-invalid={Boolean(error("fullName"))} />{error("fullName") && <p className="text-xs text-destructive">{error("fullName")}</p>}</div>
        <div className="space-y-1.5"><label htmlFor="bio" className="text-sm font-medium">Bio</label><Textarea id="bio" name="bio" defaultValue={profile.bio ?? ""} maxLength={300} rows={4} placeholder="A little about your style…" aria-invalid={Boolean(error("bio"))} />{error("bio") && <p className="text-xs text-destructive">{error("bio")}</p>}<p className="text-xs text-muted-foreground">Up to 300 characters.</p></div>
        <div className="space-y-1.5"><label htmlFor="location" className="text-sm font-medium">Location</label><Input id="location" name="location" defaultValue={profile.location ?? ""} autoComplete="address-level2" maxLength={100} placeholder="City or region" aria-invalid={Boolean(error("location"))} />{error("location") && <p className="text-xs text-destructive">{error("location")}</p>}</div>
        {state?.message && <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" : "rounded-lg border border-emerald-600/25 bg-emerald-600/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"}>{state.message}</p>}
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">{pending ? "Saving…" : "Save profile"}</Button>
      </form>
    </section>
  );
}
