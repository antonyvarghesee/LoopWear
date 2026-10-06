import "server-only";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/services/admin-auth";

const uuidSchema = z.string().uuid();
const noteSchema = z.string().trim().max(2000).optional();

const reportModerationSchema = z.object({
  reportId: uuidSchema,
  action: z.enum(["reviewed", "resolved", "dismissed"]),
  resolutionNote: noteSchema,
}).strict().superRefine((input, context) => {
  if (input.action === "reviewed" && input.resolutionNote) {
    context.addIssue({
      code: "custom",
      path: ["resolutionNote"],
      message: "A resolution note is only allowed when resolving or dismissing a report.",
    });
  }
});

const listingModerationSchema = z.object({
  listingId: uuidSchema,
  state: z.enum(["clear", "hidden"]),
  note: noteSchema,
}).strict();

const userModerationSchema = z.object({
  userId: uuidSchema,
  state: z.enum(["normal", "suspended"]),
  note: noteSchema,
}).strict();

export type ModerationActionResult =
  | { success: true }
  | { success: false; error: string };

const INVALID_INPUT = "This moderation request is invalid.";
const UNAVAILABLE = "The moderation request could not be completed. Please try again.";
const FORBIDDEN = "You are not authorized to perform this action.";
const SELF_MODERATION = "You cannot change your own moderation status.";

export async function moderateReport(input: unknown): Promise<ModerationActionResult> {
  const parsed = reportModerationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: INVALID_INPUT };

  await requireAdmin();
  try {
    const supabase = await createSupabaseServerClient();
    const { data: report, error: lookupError } = await supabase
      .from("reports")
      .select("id,status")
      .eq("id", parsed.data.reportId)
      .maybeSingle();
    if (lookupError) {
      console.error("Admin report moderation lookup failed.");
      return { success: false, error: UNAVAILABLE };
    }
    if (!report) return { success: false, error: "This report could not be found." };

    const allowed =
      (report.status === "pending" && ["reviewed", "resolved", "dismissed"].includes(parsed.data.action))
      || (report.status === "reviewed" && ["resolved", "dismissed"].includes(parsed.data.action));
    if (!allowed) return { success: false, error: "This report cannot be moved to that status." };

    const changes = {
      status: parsed.data.action,
      resolution_note: parsed.data.action === "reviewed" ? null : parsed.data.resolutionNote || null,
    };
    const { data, error } = await supabase
      .from("reports")
      .update(changes)
      .eq("id", parsed.data.reportId)
      .eq("status", report.status)
      .select("id")
      .maybeSingle();
    if (error) {
      if (error.code === "42501") return { success: false, error: FORBIDDEN };
      if (error.code === "22023") return { success: false, error: "This report cannot be moved to that status." };
      console.error("Admin report moderation update failed.");
      return { success: false, error: UNAVAILABLE };
    }
    if (!data) return { success: false, error: "This report changed before the action completed." };
    return { success: true };
  } catch {
    console.error("Admin report moderation failed.");
    return { success: false, error: UNAVAILABLE };
  }
}

export async function moderateListing(input: unknown): Promise<ModerationActionResult> {
  const parsed = listingModerationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: INVALID_INPUT };

  await requireAdmin();
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("set_listing_moderation_state", {
      p_listing_id: parsed.data.listingId,
      p_moderation_state: parsed.data.state,
      p_note: parsed.data.note || null,
    });
    if (error) {
      if (error.code === "42501") return { success: false, error: FORBIDDEN };
      if (error.code === "22023") return { success: false, error: "This listing could not be found or moderated." };
      console.error("Admin listing moderation failed.");
      return { success: false, error: UNAVAILABLE };
    }
    return { success: true };
  } catch {
    console.error("Admin listing moderation failed.");
    return { success: false, error: UNAVAILABLE };
  }
}

export async function moderateUser(input: unknown): Promise<ModerationActionResult> {
  const parsed = userModerationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: INVALID_INPUT };

  const admin = await requireAdmin();
  if (parsed.data.userId === admin.id) {
    return { success: false, error: SELF_MODERATION };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("set_user_moderation_state", {
      p_user_id: parsed.data.userId,
      p_moderation_state: parsed.data.state,
      p_note: parsed.data.note || null,
    });
    if (error) {
      if (error.code === "42501") return { success: false, error: FORBIDDEN };
      if (error.code === "22023") return { success: false, error: "This user could not be found or moderated." };
      console.error("Admin user moderation failed.");
      return { success: false, error: UNAVAILABLE };
    }
    return { success: true };
  } catch {
    console.error("Admin user moderation failed.");
    return { success: false, error: UNAVAILABLE };
  }
}
