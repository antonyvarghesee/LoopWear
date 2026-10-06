import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261019000000_moderation_database_foundation.sql"),
  "utf8",
);
const trustSafetyMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261015000000_trust_safety_foundation.sql"),
  "utf8",
);
const adminMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261018000000_admin_moderation_foundation.sql"),
  "utf8",
);
describe("Phase 14B-1 moderation database foundation contract", () => {
  it("keeps listing and account moderation in private, constrained tables", () => {
    expect(migration).toMatch(/CREATE TABLE public\.listing_moderation[\s\S]*?CHECK \(moderation_state IN \('clear', 'hidden'\)\)/i);
    expect(migration).toMatch(/CREATE TABLE public\.user_moderation[\s\S]*?CHECK \(moderation_state IN \('normal', 'suspended'\)\)/i);
    expect(migration).toMatch(/CREATE POLICY "Admins can read listing moderation state"[\s\S]*?USING \(public\.has_admin_role\(\)\)/i);
    expect(migration).toMatch(/CREATE POLICY "Admins can read user moderation state"[\s\S]*?USING \(public\.has_admin_role\(\)\)/i);
    expect(migration).toMatch(/ALTER TABLE public\.listing_moderation ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/ALTER TABLE public\.user_moderation ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.listing_moderation[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i);
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.user_moderation[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i);
    expect(migration).toMatch(/Missing row means clear/i);
    expect(migration).toMatch(/Missing row means normal/i);
    expect(migration).not.toMatch(/ALTER TABLE public\.listings[\s\S]*?ADD COLUMN[^;]*moderation/i);
    expect(migration).not.toMatch(/UPDATE public\.listings/i);
    expect(migration).not.toMatch(/ALTER TABLE public\.listings/i);
  });

  it("restricts moderation changes to database-checked admins and derives event actors from auth.uid", () => {
    expect(migration).toMatch(/FUNCTION public\.set_listing_moderation_state\([\s\S]*?p_listing_id UUID,[\s\S]*?p_moderation_state TEXT/i);
    expect(migration).toMatch(/FUNCTION public\.set_user_moderation_state\([\s\S]*?p_user_id UUID,[\s\S]*?p_moderation_state TEXT/i);
    expect(migration).toMatch(/actor_id UUID := auth\.uid\(\);[\s\S]*?NOT public\.has_admin_role\(\)/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.set_listing_moderation_state[\s\S]*?FROM PUBLIC, anon, authenticated, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.set_listing_moderation_state[\s\S]*?TO authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.set_user_moderation_state[\s\S]*?FROM PUBLIC, anon, authenticated, service_role[\s\S]*?GRANT EXECUTE ON FUNCTION public\.set_user_moderation_state[\s\S]*?TO authenticated/i);
    expect(migration).toMatch(/SET search_path = pg_catalog, public, auth[\s\S]*?SET row_security = off/i);
    expect(migration).not.toMatch(/p_actor_id|p_admin_id|p_reporter_id/i);
    expect(migration).toMatch(/FUNCTION public\.record_moderation_event\([\s\S]*?p_subject_type TEXT[\s\S]*?actor_id UUID := auth\.uid\(\)/i);
    expect(migration).toMatch(/FUNCTION public\.is_current_user_suspended\(\)/i);
    expect(migration).toMatch(/requester_id UUID := auth\.uid\(\)[\s\S]*?WHERE user_id = requester_id[\s\S]*?moderation_state = 'suspended'/i);
  });

  it("records allowed report transitions without making submitted report content editable", () => {
    expect(migration).toMatch(/ADD COLUMN resolution_note TEXT/i);
    expect(migration).toMatch(/status IN \('resolved', 'dismissed'\)/i);
    expect(migration).toMatch(/OLD\.status = 'pending' AND NEW\.status IN \('reviewed', 'resolved', 'dismissed'\)/i);
    expect(migration).toMatch(/OLD\.status = 'reviewed' AND NEW\.status IN \('resolved', 'dismissed'\)/i);
    expect(migration).toMatch(/NEW\.reporter_id IS DISTINCT FROM OLD\.reporter_id[\s\S]*?NEW\.description IS DISTINCT FROM OLD\.description/i);
    expect(migration).toMatch(/auth\.role\(\) IS DISTINCT FROM 'authenticated'[\s\S]*?NOT public\.has_admin_role\(\)/i);
    expect(migration).toMatch(/GRANT UPDATE \(status, resolution_note\) ON TABLE public\.reports TO authenticated/i);
    expect(migration).toMatch(/REVOKE UPDATE ON TABLE public\.reports FROM service_role/i);
    expect(trustSafetyMigration).toMatch(/NEW\.reporter_id := requester_id[\s\S]*?NEW\.status := 'pending'/i);
    expect(trustSafetyMigration).toMatch(/CREATE UNIQUE INDEX reports_one_active_per_reporter_target_idx/i);
  });

  it("uses append-only, admin-readable events for report, listing, and user actions", () => {
    expect(migration).toMatch(/CREATE TABLE public\.moderation_events[\s\S]*?actor_id UUID NOT NULL/i);
    expect(migration).toMatch(/CHECK \(subject_type IN \('report', 'listing', 'user'\)\)/i);
    expect(migration).toMatch(/report_reviewed[\s\S]*?report_resolved[\s\S]*?report_dismissed[\s\S]*?listing_hidden[\s\S]*?user_suspended/i);
    expect(migration).toMatch(/CREATE POLICY "Admins can read moderation events"[\s\S]*?USING \(public\.has_admin_role\(\)\)/i);
    expect(migration).toMatch(/ALTER TABLE public\.moderation_events ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.moderation_events[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i);
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON public\.moderation_events/i);
    expect(migration).toMatch(/BEFORE TRUNCATE ON public\.moderation_events/i);
    expect(migration).toMatch(/moderation events are append-only/i);
    expect(migration).toMatch(/PERFORM public\.record_moderation_event\([\s\S]*?'listing', p_listing_id[\s\S]*?event_action/i);
    expect(migration).toMatch(/PERFORM public\.record_moderation_event\([\s\S]*?'user', p_user_id[\s\S]*?event_action/i);
    expect(migration).toMatch(/PERFORM public\.record_moderation_event\([\s\S]*?'report',[\s\S]*?NEW\.id/i);
    expect(migration).toMatch(/moderation_events_subject_created_at_idx/i);
    expect(migration).toMatch(/moderation_events_actor_created_at_idx/i);
    expect(migration).toMatch(/moderation_events_report_created_at_idx/i);
  });

  it("preserves the existing admin role model and Trust & Safety target protections", () => {
    expect(adminMigration).toMatch(/CHECK \(role IN \('admin'\)\)/i);
    expect(adminMigration).toMatch(/FUNCTION public\.has_admin_role\(\)/i);
    expect(adminMigration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.user_roles FROM PUBLIC, anon, authenticated/i);
    expect(migration).not.toMatch(/CREATE TABLE public\.(orders|payments|reviews|notifications|conversations|messages)/i);
    expect(migration).not.toMatch(/ALTER TABLE public\.(orders|payments|reviews|notifications|conversations|messages)/i);
    expect(migration).not.toMatch(/CREATE POLICY[^;]+ON public\.(messages|conversations)/i);
  });
});
