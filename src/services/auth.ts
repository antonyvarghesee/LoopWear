import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface UserProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  rating: number;
  review_count: number;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

/** Returns null only when there is no authenticated session. */
export async function getCurrentUser() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase authentication is not configured.");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error?.name === "AuthSessionMissingError") return null;
    if (error) throw error;
    return data.user;
  } catch (error) {
    console.error("Unable to verify the current Supabase session:", error);
    throw new Error("Unable to verify your session. Please try again.");
  }
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio, location, rating, review_count, is_verified, created_at, updated_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;
    return data as UserProfile | null;
  } catch (error) {
    console.error("Unable to retrieve the current profile:", error);
    throw new Error("Unable to load your profile. Please try again.");
  }
}

/** Redirects unauthenticated users. Infrastructure errors are allowed to surface. */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
