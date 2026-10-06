import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Creates an elevated administrative Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * WARNING: Never expose this key or import this module into browser/client code.
 * Use only for trusted server-side background scripts or webhook handlers.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL environment variables for admin client.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
