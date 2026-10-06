import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261020000000_moderation_backend_enforcement.sql"),
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
