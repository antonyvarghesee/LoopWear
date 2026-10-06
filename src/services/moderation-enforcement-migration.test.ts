import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261020000000_moderation_backend_enforcement.sql"),
  "utf8",
);
const suspendedSellerPurchaseFix = readFileSync(
  join(process.cwd(), "supabase/migrations/20261021000000_suspended_seller_purchase_protection.sql"),
  "utf8",
);

describe("Phase 14B-2 database enforcement contract", () => {
  it("filters moderated listings from direct and definer-based public reads", () => {
    expect(migration).toMatch(/FUNCTION public\.is_listing_publicly_available\(p_listing_id UUID\)[\s\S]*?listing\.status = 'ACTIVE'[\s\S]*?moderation_state = 'hidden'/i);
    expect(migration).toMatch(/CREATE POLICY "Active listings are public and sellers can view their own"[\s\S]*?public\.is_listing_publicly_available\(id\)/i);
    expect(migration).toMatch(/FUNCTION public\.get_public_seller_profiles_for_listings[\s\S]*?public\.is_listing_publicly_available\(listing\.id\)/i);
    expect(migration).toMatch(/FUNCTION public\.get_seller_active_listings[\s\S]*?WHERE public\.is_listing_publicly_available\(listing\.id\)/i);
    expect(migration).toMatch(/CREATE POLICY "Active listing images are public; sellers can view own"[\s\S]*?public\.is_listing_publicly_available\(listing\.id\)/i);
    expect(migration).toMatch(/CREATE POLICY "Active listing image objects can be read"[\s\S]*?public\.is_listing_publicly_available\(listing\.id\)/i);
    expect(migration).not.toMatch(/UPDATE public\.listings\s+SET status\s*=/i);
  });

  it("blocks suspended accounts from listing, image, messaging, review, and checkout writes", () => {
    expect(migration).toMatch(/CREATE POLICY "Authenticated sellers can create their own drafts"[\s\S]*?NOT public\.is_current_user_suspended\(\)/i);
    expect(migration).toMatch(/CREATE POLICY "Sellers can update their own listings"[\s\S]*?NOT public\.is_current_user_suspended\(\)/i);
    expect(migration).toMatch(/CREATE POLICY "Sellers can add images to editable own listings"[\s\S]*?NOT public\.is_current_user_suspended\(\)/i);
    expect(migration).toMatch(/CREATE POLICY "Listing image owners can upload"[\s\S]*?NOT public\.is_current_user_suspended\(\)/i);
    expect(migration).toMatch(/FUNCTION public\.get_or_create_listing_conversation[\s\S]*?public\.is_current_user_suspended\(\)/i);
    expect(migration).toMatch(/CREATE POLICY "Messaging participants can send own messages"[\s\S]*?NOT public\.is_current_user_suspended\(\)/i);
    expect(migration).toMatch(/FUNCTION public\.prepare_purchase_review\(\)[\s\S]*?public\.is_current_user_suspended\(\)/i);
    expect(migration).toMatch(/CREATE POLICY "Buyers can create reviews for completed purchases"[\s\S]*?NOT public\.is_current_user_suspended\(\)/i);
    expect(migration).toMatch(/FUNCTION public\.register_provider_checkout_attempt[\s\S]*?moderation_state = 'suspended'/i);
  });

  it("keeps active clear listings available for normal or restored sellers and hides suspended sellers", () => {
    const availability = suspendedSellerPurchaseFix.split(
      "CREATE OR REPLACE FUNCTION public.is_listing_publicly_available",
    )[1]?.split("ALTER FUNCTION public.is_listing_publicly_available")[0] ?? "";

    expect(availability).toMatch(/listing\.status = 'ACTIVE'/i);
    expect(availability).toMatch(/AND NOT EXISTS \([\s\S]*?listing_moderation[\s\S]*?moderation_state = 'hidden'/i);
    expect(availability).toMatch(/AND NOT EXISTS \([\s\S]*?user_moderation[\s\S]*?seller_state\.user_id = listing\.seller_id[\s\S]*?moderation_state = 'suspended'/i);
    expect(availability).not.toMatch(/moderation_state\s*<>\s*'normal'/i);
    expect(availability).not.toMatch(/UPDATE public\.listings/i);
    expect(migration).toMatch(/p_moderation_state NOT IN \('normal', 'suspended'\)/i);

    const checkoutRegistration = suspendedSellerPurchaseFix.split(
      "CREATE OR REPLACE FUNCTION public.register_provider_checkout_attempt",
    )[1]?.split("ALTER FUNCTION public.register_provider_checkout_attempt")[0] ?? "";
    expect(checkoutRegistration).toMatch(/FROM public\.profiles WHERE id = listing_row\.seller_id FOR SHARE/i);
    expect(checkoutRegistration).toMatch(/public\.is_listing_publicly_available\(p_listing_id\)/i);
    expect(checkoutRegistration).toMatch(/buyer_state\.moderation_state = 'suspended'/i);

    const conversationCreation = suspendedSellerPurchaseFix.split(
      "CREATE OR REPLACE FUNCTION public.get_or_create_listing_conversation",
    )[1]?.split("ALTER FUNCTION public.get_or_create_listing_conversation")[0] ?? "";
    expect(conversationCreation).toMatch(/FROM public\.profiles WHERE id = listing_seller_id FOR SHARE/i);
    expect(conversationCreation).toMatch(/public\.is_listing_publicly_available\(p_listing_id\)/i);
    expect(conversationCreation).toMatch(/seller_state\.moderation_state = 'suspended'/i);

    expect(suspendedSellerPurchaseFix).toMatch(/SET search_path = pg_catalog, public[\s\S]*?SET row_security = off[\s\S]*?CREATE OR REPLACE FUNCTION public\.register_provider_checkout_attempt/i);
    expect(suspendedSellerPurchaseFix).toMatch(/REVOKE ALL ON FUNCTION public\.register_provider_checkout_attempt[\s\S]*?FROM PUBLIC, anon, authenticated, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.register_provider_checkout_attempt[\s\S]*?TO service_role/i);
  });

  it("keeps account moderation administrator-bound and prevents self-moderation", () => {
    expect(migration).toMatch(/FUNCTION public\.set_user_moderation_state[\s\S]*?actor_id UUID := auth\.uid\(\)[\s\S]*?NOT public\.has_admin_role\(\)[\s\S]*?IF p_user_id = actor_id THEN/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.set_user_moderation_state\(UUID, TEXT, TEXT\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.set_user_moderation_state\(UUID, TEXT, TEXT\)[\s\S]*?TO authenticated/i);
  });

  it("retains fixed-path, narrowly executable database functions and avoids private message admin access", () => {
    expect(migration).toMatch(/FUNCTION public\.is_listing_publicly_available[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public[\s\S]*?SET row_security = off/i);
    expect(migration).toMatch(/FUNCTION public\.get_or_create_listing_conversation[\s\S]*?SET search_path = pg_catalog, public, auth[\s\S]*?SET row_security = off/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_or_create_listing_conversation\(UUID\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.get_or_create_listing_conversation\(UUID\)[\s\S]*?TO authenticated/i);
    expect(migration).not.toMatch(/CREATE POLICY[^;]+ON public\.(messages|conversations) FOR SELECT/i);
    expect(migration).not.toMatch(/ALTER TABLE public\.listings[\s\S]*?ADD COLUMN[^;]*moderation/i);
  });
});
