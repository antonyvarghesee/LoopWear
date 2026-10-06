import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function isCurrentUserSuspended(supabase?: SupabaseClient): Promise<boolean> {
  const client = supabase ?? await createSupabaseServerClient();
  const { data, error } = await client.rpc("is_current_user_suspended");
  if (error || typeof data !== "boolean") {
    console.error("Account moderation status lookup failed.");
    throw new Error("Account status could not be verified.");
  }
  return data;
}
