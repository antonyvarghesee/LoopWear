import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261015000000_trust_safety_foundation.sql"),
  "utf8",
);
const initialSchema = readFileSync(
  join(process.cwd(), "supabase/migrations/20261004000000_initial_schema.sql"),
  "utf8",
);
const messagingMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261004000008_messaging.sql"),
  "utf8",
);

describe("Phase 12A trust and safety migration contract", () => {
  it("reuses reports and adds typed target, description, and update timestamp fields", () => {
    expect(initialSchema).toMatch(/CREATE TABLE IF NOT EXISTS public\.reports/i);
    expect(migration).not.toMatch(/CREATE TABLE(?: IF NOT EXISTS)? public\.reports/i);
    expect(migration).toMatch(/ALTER TABLE public\.reports[\s\S]*?ADD COLUMN IF NOT EXISTS target_type TEXT[\s\S]*?target_id UUID[\s\S]*?description TEXT[\s\S]*?updated_at TIMESTAMPTZ/i);
    expect(migration).toMatch(/target_type IN \('user', 'listing', 'conversation', 'message'\)/i);
  });

  it("derives reporter and pending status from the authenticated session, rejecting self/invalid targets", () => {
    expect(migration).toMatch(/NEW\.reporter_id := requester_id[\s\S]*?NEW\.status := 'pending'/i);
    expect(migration).toMatch(/NEW\.target_id = requester_id/i);
    expect(migration).toMatch(/public\.profiles AS profile WHERE profile\.id = NEW\.target_id/i);
    expect(migration).toMatch(/public\.listings AS listing[\s\S]*?listing\.id = NEW\.target_id[\s\S]*?listing\.seller_id <> requester_id/i);
    expect(migration).toMatch(/public\.conversations AS conversation[\s\S]*?conversation\.id = NEW\.target_id[\s\S]*?conversation\.buyer_id = requester_id OR conversation\.seller_id = requester_id/i);
    expect(migration).toMatch(/public\.messages AS message[\s\S]*?message\.id = NEW\.target_id[\s\S]*?conversation\.buyer_id = requester_id OR conversation\.seller_id = requester_id[\s\S]*?message_row\.sender_id = requester_id/i);
  });

  it("prevents duplicate active reports while allowing closed reports to be made again", () => {
    expect(migration).toMatch(/GROUP BY reporter_id, target_type, target_id[\s\S]*?HAVING COUNT\(\*\) > 1/i);
    expect(migration).toMatch(/CREATE UNIQUE INDEX reports_one_active_per_reporter_target_idx[\s\S]*?WHERE status IN \('pending', 'reviewed'\)/i);
  });

  it("allows reporters to read and submit, but does not grant ordinary report updates", () => {
    expect(migration).toMatch(/CREATE POLICY "Reporters can read own reports"[\s\S]*?USING \(reporter_id = \(SELECT auth\.uid\(\)\)\)/i);
    expect(migration).toMatch(/CREATE POLICY "Authenticated users can submit reports"[\s\S]*?WITH CHECK \(reporter_id = \(SELECT auth\.uid\(\)\) AND status = 'pending'\)/i);
    expect(migration).toMatch(/GRANT INSERT \(target_type, target_id, reason, description\)[\s\S]*?TO authenticated/i);
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.reports FROM PUBLIC, anon, authenticated/i);
    expect(migration).not.toMatch(/GRANT UPDATE[^;]*public\.reports[^;]*TO authenticated/i);
    expect(migration).toMatch(/TG_OP = 'UPDATE'[\s\S]*?auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
  });

  it("enforces user block ownership, self-block prevention, and one block per pair", () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.user_blocks/i);
    expect(migration).toMatch(/PRIMARY KEY \(blocker_id, blocked_id\)/i);
    expect(migration).toMatch(/CHECK \(blocker_id <> blocked_id\)/i);
    expect(migration).toMatch(/NEW\.blocker_id := auth\.uid\(\)/i);
    expect(migration).toMatch(/NEW\.blocked_id = auth\.uid\(\)/i);
    expect(migration).toMatch(/CREATE POLICY "Users can read own blocks"[\s\S]*?USING \(blocker_id = \(SELECT auth\.uid\(\)\)\)/i);
    expect(migration).toMatch(/CREATE POLICY "Users can create own blocks"[\s\S]*?WITH CHECK \(blocker_id = \(SELECT auth\.uid\(\)\)\)/i);
    expect(migration).toMatch(/CREATE POLICY "Users can remove own blocks"[\s\S]*?FOR DELETE[\s\S]*?USING \(blocker_id = \(SELECT auth\.uid\(\)\)\)/i);
    expect(migration).not.toMatch(/CREATE POLICY .*user_blocks FOR UPDATE/i);
    expect(migration).not.toMatch(/GRANT UPDATE[^;]*user_blocks[^;]*TO authenticated/i);
  });

  it("keeps moderation operations separate from ordinary users", () => {
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.reports FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT ALL PRIVILEGES ON TABLE public\.reports TO service_role/i);
    expect(migration.replace(/\s+/g, " ")).toContain("GRANT ALL PRIVILEGES ON public.user_blocks TO service_role;");
    expect(migration).toMatch(/NEW\.status := 'pending'/i);
  });

  it("prevents blocked users from opening conversations or sending messages without changing existing reads", () => {
    expect(messagingMigration).toMatch(/CREATE POLICY "Messaging participants can read conversations"/i);
    expect(messagingMigration).toMatch(/CREATE POLICY "Messaging participants can read messages"/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_or_create_listing_conversation/i);
    expect(migration).toMatch(/block\.blocker_id = requester_id AND block\.blocked_id = listing_seller_id/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.can_send_conversation_message/i);
    expect(migration).toMatch(/CREATE POLICY "Messaging participants can send own messages"[\s\S]*?can_send_conversation_message\(conversation_id\)/i);
    expect(migration).not.toMatch(/DROP POLICY .*read messages|DROP POLICY .*read conversations/i);
  });

  it("does not modify payment, order, or listing status architecture", () => {
    expect(migration).not.toMatch(/ALTER TABLE public\.(orders|payments|listings)/i);
    expect(migration).not.toMatch(/confirm_provider_purchase|SET status = 'SOLD'/i);
  });
});
