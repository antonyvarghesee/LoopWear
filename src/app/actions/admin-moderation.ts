"use server";

import { revalidatePath } from "next/cache";
import {
  moderateListing,
  moderateReport,
  moderateUser,
} from "@/services/admin-moderation";

async function revalidateAdmin(result: Awaited<ReturnType<typeof moderateReport>>) {
  if (result.success) revalidatePath("/admin");
  return result;
}

export async function moderateReportAction(input: unknown) {
  return revalidateAdmin(await moderateReport(input));
}

export async function moderateListingAction(input: unknown) {
  const result = await moderateListing(input);
  if (result.success) {
    revalidatePath("/admin");
    revalidatePath("/browse");
    revalidatePath("/favorites");
    revalidatePath("/listing/[slug]", "page");
    revalidatePath("/seller/[username]", "page");
  }
  return result;
}

export async function moderateUserAction(input: unknown) {
  return revalidateAdmin(await moderateUser(input));
}
