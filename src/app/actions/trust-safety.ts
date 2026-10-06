"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { submitTrustSafetyReport, setUserBlock } from "@/services/trust-safety";

const reportActionSchema = z.object({
  targetType: z.enum(["user", "listing", "conversation", "message"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional().nullable(),
}).strict();

export async function submitTrustSafetyReportAction(input: unknown) {
  const parsed = reportActionSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "Enter a valid report reason and target." };
  const result = await submitTrustSafetyReport(parsed.data);
  if (result.success) {
    revalidatePath("/messages");
    revalidatePath("/listing/[slug]", "page");
    revalidatePath("/seller/[username]", "page");
  }
  return result;
}

const blockActionSchema = z.object({
  userId: z.string().uuid(),
  blocked: z.boolean(),
}).strict();

export async function setUserBlockAction(input: unknown) {
  const parsed = blockActionSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "This user could not be found." };
  const result = await setUserBlock(parsed.data.userId, parsed.data.blocked);
  if (result.success) {
    revalidatePath("/messages");
    revalidatePath("/messages/[conversationId]", "page");
    revalidatePath("/seller/[username]", "page");
    revalidatePath("/listing/[slug]", "page");
  }
  return result;
}
