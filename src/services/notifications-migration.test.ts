import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261016000000_notifications_security.sql"),
  "utf8",
);
const initialSchema = readFileSync(
  join(process.cwd(), "supabase/migrations/20261004000000_initial_schema.sql"),
  "utf8",
);

describe("Phase 13A notifications migration contract", () => {
  it("extends the existing notifications table rather than creating a duplicate", () => {
    expect(initialSchema).toMatch(/CREATE TABLE IF NOT EXISTS public\.notifications/i);
    expect(migration).not.toMatch(/CREATE TABLE(?: IF NOT EXISTS)? public\.notifications/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS related_entity_type TEXT/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS related_entity_id UUID/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ/i);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS notifications_recipient_created_at_idx/i);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS notifications_recipient_unread_created_at_idx[\s\S]*?WHERE is_read = FALSE/i);
  });

  it("allows only recipient reads and read-state updates to authenticated users", () => {
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.notifications FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.notifications TO authenticated/i);
    expect(migration).toMatch(/GRANT UPDATE \(is_read\) ON TABLE public\.notifications TO authenticated/i);
    expect(migration).toMatch(/CREATE POLICY "Recipients can read own notifications"[\s\S]*?USING \(user_id = \(SELECT auth\.uid\(\)\)\)/i);
    expect(migration).toMatch(/CREATE POLICY "Recipients can update own notification read state"[\s\S]*?USING \(user_id = \(SELECT auth\.uid\(\)\)\)[\s\S]*?WITH CHECK \(user_id = \(SELECT auth\.uid\(\)\)\)/i);
    expect(migration).not.toMatch(/FOR INSERT TO authenticated/i);
    expect(migration).not.toMatch(/FOR DELETE TO authenticated/i);
  });

  it("protects immutable notification content and derives read_at in the database", () => {
    expect(migration).toMatch(/NEW\.user_id IS DISTINCT FROM OLD\.user_id/);
    expect(migration).toMatch(/NEW\.type IS DISTINCT FROM OLD\.type/);
    expect(migration).toMatch(/NEW\.title IS DISTINCT FROM OLD\.title/);
    expect(migration).toMatch(/NEW\.message IS DISTINCT FROM OLD\.message/);
    expect(migration).toMatch(/NEW\.related_entity_id IS DISTINCT FROM OLD\.related_entity_id/);
    expect(migration).toMatch(/NEW\.read_at := CASE[\s\S]*?CURRENT_TIMESTAMP/i);
    expect(migration).toMatch(/notifications_read_at_consistency_check[\s\S]*?is_read AND read_at IS NOT NULL[\s\S]*?NOT is_read AND read_at IS NULL/i);
  });

  it("reserves notification creation for trusted server-side operations", () => {
    expect(migration).toMatch(/GRANT ALL PRIVILEGES ON TABLE public\.notifications TO service_role/i);
    expect(migration).not.toMatch(/GRANT INSERT[^;]*public\.notifications[^;]*TO authenticated/i);
    expect(migration).not.toMatch(/GRANT DELETE[^;]*public\.notifications[^;]*TO authenticated/i);
  });
});
