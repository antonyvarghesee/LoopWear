import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/validations/profile";
import { getCurrentUser, type UserProfile } from "@/services/auth";

export type ProfileUpdateResult =
  | { success: true; profile: UserProfile }
  | { success: false; error: string; field?: "username" };

export async function updateProfileService(input: UpdateProfileInput): Promise<ProfileUpdateResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be signed in to update your profile." };
  }

  const validation = updateProfileSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "Please check your profile details.",
    };
  }

  const { username, fullName, bio, location } = validation.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      username,
      full_name: fullName || null,
      bio: bio || null,
      location: location || null,
    })
    .eq("id", user.id)
    .select("id, username, full_name, avatar_url, bio, location, rating, review_count, is_verified, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "That username is already in use. Please choose another.", field: "username" };
    }
    console.error("Unable to update the current profile:", error);
    return { success: false, error: "We couldn't save your profile. Please try again." };
  }

  return { success: true, profile: data as UserProfile };
}
