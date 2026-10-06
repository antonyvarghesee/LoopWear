import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/services/auth";

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fadmin");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("has_admin_role");
  if (error) {
    console.error("Admin authorization check failed.");
    throw new Error("Admin access could not be verified.");
  }
  if (data !== true) redirect("/");

  return user;
}
