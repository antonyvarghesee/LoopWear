import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Creates a browser-side Supabase client using NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Use ONLY in Client Components or browser event handlers.
 */
export function createSupabaseBrowserClient() {
  const isConfigured = isSupabaseConfigured();
  if (!isConfigured) {
    if (typeof window !== "undefined") {
      console.warn(
        "Supabase credentials not configured in environment variables. Returning browser fallback client.",
      );
    }
  }

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  return createBrowserClient(url, anonKey);
}
