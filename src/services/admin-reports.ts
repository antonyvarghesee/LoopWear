import "server-only";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/services/admin-auth";

const adminReportsQuerySchema = z.object({
  status: z.enum(["pending", "reviewed", "resolved", "dismissed"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(10000).default(0),
}).strict();

export type AdminReport = {
  id: string;
  reporter_id: string;
  target_type: "user" | "listing" | "conversation" | "message";
  target_id: string;
  reason: string;
  description: string | null;
  status: "pending" | "reviewed" | "resolved" | "dismissed";
  created_at: string;
  updated_at: string;
};

export async function getAdminReports(input: unknown = {}): Promise<AdminReport[]> {
  await requireAdmin();
  const parsed = adminReportsQuerySchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid admin reports query.");

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("reports")
      .select("id,reporter_id,target_type,target_id,reason,description,status,created_at,updated_at");
    if (parsed.data.status) query = query.eq("status", parsed.data.status);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);
    if (error) throw error;
    return (data ?? []) as AdminReport[];
  } catch {
    console.error("Admin reports lookup failed.");
    throw new Error("Reports are temporarily unavailable.");
  }
}
