import "server-only";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth";

const uuidSchema = z.string().uuid();
const reportInputSchema = z.object({
  targetType: z.enum(["user", "listing", "conversation", "message"]),
  targetId: uuidSchema,
  reason: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional().nullable(),
}).strict();

type TrustSafetyResult = { success: true } | { success: false; error: string };

export type ConversationBlockState = {
  canSend: boolean;
  currentUserBlockedOther: boolean;
  otherBlockedCurrentUser: boolean;
  otherUserId: string | null;
};

function safeDatabaseError(error: { code?: string } | null): TrustSafetyResult {
  if (error?.code === "23505") {
    return { success: false, error: "You already have an active report for this item." };
  }
  if (error?.code === "22023" || error?.code === "42501") {
    return { success: false, error: "This action is not available for that target." };
  }
  return { success: false, error: "The request could not be completed. Please try again." };
}

export async function submitTrustSafetyReport(input: unknown): Promise<TrustSafetyResult> {
  const parsed = reportInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Enter a valid report reason and target." };

  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Sign in to submit a report." };

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("reports").insert({
      target_type: parsed.data.targetType,
      target_id: parsed.data.targetId,
      reason: parsed.data.reason,
      description: parsed.data.description || null,
    });
    if (error) {
      if (error.code === "23505" || error.code === "22023" || error.code === "42501") {
        return safeDatabaseError(error);
      }
      console.error("Trust and safety report submission failed.");
      return { success: false, error: "Your report could not be submitted. Please try again." };
    }
    return { success: true };
  } catch {
    console.error("Trust and safety report submission failed.");
    return { success: false, error: "Your report could not be submitted. Please try again." };
  }
}

async function getAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  return user;
}

export async function resolvePublicUsername(username: unknown): Promise<string | null> {
  if (typeof username !== "string" || !/^[A-Za-z0-9_]{3,20}$/.test(username)) return null;
  if (!await getAuthenticatedUser()) return null;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  } catch {
    console.error("Trust and safety profile lookup failed.");
    throw new Error("This profile is temporarily unavailable.");
  }
}

export async function setUserBlock(blockedUserId: unknown, blocked: boolean): Promise<TrustSafetyResult> {
  const parsed = uuidSchema.safeParse(blockedUserId);
  if (!parsed.success) return { success: false, error: "This user could not be found." };

  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Sign in to manage blocks." };
    if (parsed.data === user.id) return { success: false, error: "You cannot block yourself." };

    const supabase = await createSupabaseServerClient();
    if (blocked) {
      const { error } = await supabase.from("user_blocks").insert({ blocked_id: parsed.data });
      if (error?.code === "23505") return { success: true };
      if (error) {
        console.error("User block request failed.");
        return safeDatabaseError(error);
      }
      return { success: true };
    }

    const { error } = await supabase.from("user_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", parsed.data);
    if (error) {
      console.error("User unblock request failed.");
      return { success: false, error: "This user could not be unblocked. Please try again." };
    }
    return { success: true };
  } catch {
    console.error("User block state update failed.");
    return { success: false, error: "This user could not be updated. Please try again." };
  }
}

export async function getUserBlockState(targetUserId: unknown): Promise<boolean> {
  const parsed = uuidSchema.safeParse(targetUserId);
  if (!parsed.success) return false;

  try {
    const user = await getCurrentUser();
    if (!user || parsed.data === user.id) return false;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", parsed.data)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  } catch {
    console.error("User block state lookup failed.");
    throw new Error("Block status is temporarily unavailable.");
  }
}

export async function getConversationBlockState(conversationId: unknown): Promise<ConversationBlockState> {
  const parsed = uuidSchema.safeParse(conversationId);
  const user = await getCurrentUser();
  if (!parsed.success || !user) {
    return { canSend: false, currentUserBlockedOther: false, otherBlockedCurrentUser: false, otherUserId: null };
  }

  const supabase = await createSupabaseServerClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("buyer_id, seller_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (conversationError) throw new Error("Conversation block status is temporarily unavailable.");
  if (!conversation || ![conversation.buyer_id, conversation.seller_id].includes(user.id)) {
    return { canSend: false, currentUserBlockedOther: false, otherBlockedCurrentUser: false, otherUserId: null };
  }

  const otherUserId = conversation.buyer_id === user.id ? conversation.seller_id : conversation.buyer_id;
  const [{ data: ownBlock, error: blockError }, { data: allowed, error: sendError }] = await Promise.all([
    supabase.from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", otherUserId)
      .maybeSingle(),
    supabase.rpc("can_send_conversation_message", { p_conversation_id: parsed.data }),
  ]);
  if (blockError || sendError) throw new Error("Conversation block status is temporarily unavailable.");

  const currentUserBlockedOther = Boolean(ownBlock);
  const canSend = allowed === true;
  return {
    canSend,
    currentUserBlockedOther,
    otherBlockedCurrentUser: !canSend && !currentUserBlockedOther,
    otherUserId,
  };
}
