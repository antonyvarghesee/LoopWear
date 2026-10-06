import "server-only";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/services/admin-auth";

const lookupIdSchema = z.string().uuid();

export type AdminListingModerationRecord = {
  id: string;
  title: string;
  slug: string;
  status: string;
  sellerId: string;
  sellerUsername: string | null;
  moderationState: "clear" | "hidden";
};

export type AdminUserModerationRecord = {
  id: string;
  username: string | null;
  fullName: string | null;
  moderationState: "normal" | "suspended";
  updatedAt: string | null;
};

export type AdminModerationEvent = {
  id: string;
  actor_id: string;
  subject_type: "report" | "listing" | "user";
  subject_id: string;
  action: string;
  note: string | null;
  report_id: string | null;
  created_at: string;
};

export type AdminConsoleLookup<T> =
  | { status: "found"; record: T }
  | { status: "not-found" }
  | { status: "unavailable" };

export async function getAdminListingModeration(input: unknown): Promise<AdminConsoleLookup<AdminListingModerationRecord>> {
  await requireAdmin();
  const parsed = lookupIdSchema.safeParse(input);
  if (!parsed.success) return { status: "not-found" };

  try {
    const admin = createSupabaseAdminClient();
    const { data: listing, error: listingError } = await admin
      .from("listings")
      .select("id,title,slug,status,seller_id")
      .eq("id", parsed.data)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listing) return { status: "not-found" };

    const supabase = await createSupabaseServerClient();
    const [{ data: profile, error: profileError }, { data: moderation, error: moderationError }] = await Promise.all([
      admin.from("profiles").select("username").eq("id", listing.seller_id).maybeSingle(),
      supabase.from("listing_moderation").select("moderation_state").eq("listing_id", listing.id).maybeSingle(),
    ]);
    if (profileError || moderationError) throw profileError ?? moderationError;
    if (moderation && moderation.moderation_state !== "clear" && moderation.moderation_state !== "hidden") {
      throw new Error("Unexpected listing moderation state.");
    }
    return {
      status: "found",
      record: {
        id: listing.id,
        title: listing.title,
        slug: listing.slug,
        status: listing.status,
        sellerId: listing.seller_id,
        sellerUsername: profile?.username ?? null,
        moderationState: moderation?.moderation_state ?? "clear",
      },
    };
  } catch {
    console.error("Admin listing moderation lookup failed.");
    return { status: "unavailable" };
  }
}

export async function getAdminUserModeration(input: unknown): Promise<AdminConsoleLookup<AdminUserModerationRecord>> {
  await requireAdmin();
  const parsed = lookupIdSchema.safeParse(input);
  if (!parsed.success) return { status: "not-found" };

  try {
    const admin = createSupabaseAdminClient();
    const supabase = await createSupabaseServerClient();
    const [{ data: profile, error: profileError }, { data: moderation, error: moderationError }] = await Promise.all([
      admin.from("profiles").select("id,username,full_name").eq("id", parsed.data).maybeSingle(),
      supabase.from("user_moderation").select("moderation_state,updated_at").eq("user_id", parsed.data).maybeSingle(),
    ]);
    if (profileError || moderationError) throw profileError ?? moderationError;
    if (!profile) return { status: "not-found" };
    if (moderation && moderation.moderation_state !== "normal" && moderation.moderation_state !== "suspended") {
      throw new Error("Unexpected user moderation state.");
    }
    return {
      status: "found",
      record: {
        id: profile.id,
        username: profile.username ?? null,
        fullName: profile.full_name ?? null,
        moderationState: moderation?.moderation_state ?? "normal",
        updatedAt: moderation?.updated_at ?? null,
      },
    };
  } catch {
    console.error("Admin user moderation lookup failed.");
    return { status: "unavailable" };
  }
}

export async function getAdminModerationEvents(): Promise<AdminModerationEvent[]> {
  await requireAdmin();
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("moderation_events")
      .select("id,actor_id,subject_type,subject_id,action,note,report_id,created_at")
      .order("created_at", { ascending: false })
      .range(0, 49);
    if (error) throw error;
    return (data ?? []) as AdminModerationEvent[];
  } catch {
    console.error("Admin moderation history lookup failed.");
    throw new Error("Moderation history is temporarily unavailable.");
  }
}
