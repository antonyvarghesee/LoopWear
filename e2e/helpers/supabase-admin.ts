import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateE2EEnvironment } from "./e2e-env";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  username: string;
  fullName: string;
}

export interface TestListing {
  id: string;
  sellerId: string;
  title: string;
  slug: string;
  sellingPrice: number;
}

// Track created entities for deterministic cleanup
const createdUserIds = new Set<string>();
const createdListingIds = new Set<string>();

let adminClientInstance: SupabaseClient | null = null;

/**
 * Returns a Node-only administrative Supabase client bound strictly to the E2E database.
 * NEVER import or expose this helper in browser/client code.
 */
export function createE2EAdminClient(): SupabaseClient {
  if (adminClientInstance) return adminClientInstance;

  const env = validateE2EEnvironment();
  adminClientInstance = createClient(env.url, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return adminClientInstance;
}

/**
 * Creates a deterministic, confirmed test user in the E2E Supabase database.
 */
export async function createTestUser(options: {
  role: "buyer" | "seller" | "admin";
  prefix?: string;
}): Promise<TestUser> {
  const supabase = createE2EAdminClient();
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const tag = `${options.prefix || "e2e"}_${options.role}_${timestamp}_${random}`;
  
  const email = `${tag}@example.com`;
  const username = `u_${options.role}_${timestamp.toString().slice(-6)}_${random}`;
  const password = "TestPassword123!";
  const fullName = `E2E Test ${options.role.toUpperCase()}`;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    phone: "1234567890",
    email_confirm: true,
    phone_confirm: true,
    user_metadata: {
      username,
      full_name: fullName,
    },
  });

  if (error || !data.user) {
    throw new Error(`Failed to create E2E test user (${options.role}): ${error?.message || "No user returned"}`);
  }

  const userId = data.user.id;
  createdUserIds.add(userId);

  // Ensure profile row exists (trigger usually handles it, but verify/upsert if missing)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    await supabase.from("profiles").upsert({
      id: userId,
      username,
      full_name: fullName,
    });
  }

  return {
    id: userId,
    email,
    password,
    username,
    fullName,
  };
}

/**
 * Creates an ACTIVE test listing owned by the specified seller in the E2E database.
 */
export async function createTestListing(options: {
  sellerId: string;
  title?: string;
  sellingPrice?: number;
}): Promise<TestListing> {
  const supabase = createE2EAdminClient();
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  const title = options.title || `E2E Item ${timestamp}_${random}`;
  const sellingPrice = options.sellingPrice || 25.00;

  // Retrieve valid catalog category and brand
  const [{ data: categories }, { data: brands }] = await Promise.all([
    supabase.from("categories").select("id").limit(1),
    supabase.from("brands").select("id").limit(1),
  ]);

  const categoryId = categories?.[0]?.id ?? null;
  const brandId = brands?.[0]?.id ?? null;

  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = `${baseSlug}-${timestamp}`;

  const { data, error } = await supabase
    .from("listings")
    .insert({
      seller_id: options.sellerId,
      title,
      slug,
      description: "E2E test listing description for validating critical order fulfillment lifecycle.",
      category_id: categoryId,
      brand_id: brandId,
      gender: "Unisex",
      size: "M",
      condition: "Like New",
      color: "Blue",
      material: "Cotton",
      selling_price: sellingPrice,
      status: "ACTIVE",
    })
    .select("id, seller_id, title, slug, selling_price")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create E2E test listing: ${error?.message || "No data returned"}`);
  }

  createdListingIds.add(data.id);

  return {
    id: data.id,
    sellerId: data.seller_id,
    title: data.title,
    slug: data.slug,
    sellingPrice: Number(data.selling_price),
  };
}

/**
 * Cleans up ONLY the records created by current E2E test helpers.
 * Deleting auth users cascades and deletes associated profiles, listings, and orders safely.
 */
export async function cleanupE2ETestData(): Promise<void> {
  const supabase = createE2EAdminClient();

  // Delete created users (cascades to listings, orders, profiles, etc.)
  for (const userId of Array.from(createdUserIds)) {
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (err) {
      console.error(`Cleanup error deleting E2E test user ${userId}:`, err);
    }
  }

  createdUserIds.clear();
  createdListingIds.clear();
}
