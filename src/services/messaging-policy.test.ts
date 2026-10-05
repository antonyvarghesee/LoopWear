import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261004000008_messaging.sql"), "utf8");

describe("messaging database security contract", () => {
  it("replaces permissive participant insertion with server-derived active-listing creation", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Users can start conversations"');
    expect(migration).toMatch(/listing\.status\s*=\s*'ACTIVE'/i);
    expect(migration).toMatch(/listing_seller_id\s*=\s*requester_id/i);
    expect(migration).toMatch(/INSERT INTO public\.conversations \(listing_id, buyer_id, seller_id\)[\s\S]+?VALUES \(p_listing_id, requester_id, listing_seller_id\)/i);
    expect(migration).toMatch(/unique_buyer_seller_listing_conversation DO NOTHING/i);
    expect(migration).toMatch(/buyer_id <> seller_id/i);
  });

  it("restricts conversation/message access and direct message writes to authenticated participants", () => {
    expect(migration).toMatch(/conversations FOR SELECT TO authenticated[\s\S]+?auth\.uid\(\)[\s\S]+?buyer_id[\s\S]+?seller_id/i);
    expect(migration).toMatch(/messages FOR SELECT TO authenticated[\s\S]+?conversation\.buyer_id[\s\S]+?conversation\.seller_id/i);
    expect(migration).toMatch(/messages FOR INSERT TO authenticated[\s\S]+?sender_id = \(SELECT auth\.uid\(\)\)/i);
    expect(migration).toContain("REVOKE ALL ON TABLE public.conversations FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT INSERT (conversation_id, content) ON TABLE public.messages TO authenticated");
    expect(migration).not.toMatch(/CREATE POLICY[^;]+ON public\.messages FOR DELETE/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.mark_messaging_conversation_read\(UUID\) FROM PUBLIC, anon, authenticated/i);
  });

  it("counts only unread messages received by the current authenticated user", () => {
    expect(migration).toMatch(/LEFT JOIN LATERAL \([\s\S]+?SELECT COUNT\(\*\) AS total[\s\S]+?message\.sender_id <> \(SELECT auth\.uid\(\)\)[\s\S]+?message\.is_read = FALSE[\s\S]+?\) AS unread/i);
    expect(migration).toMatch(/WHERE \(SELECT auth\.uid\(\)\) IS NOT NULL[\s\S]+?conversation\.buyer_id <> conversation\.seller_id[\s\S]+?auth\.uid\(\)[\s\S]+?conversation\.buyer_id[\s\S]+?conversation\.seller_id/i);
  });

  it("requires a conversation participant and marks only received messages read", () => {
    expect(migration).toMatch(/char_length\(btrim\(content\)\) BETWEEN 1 AND 2000/i);
    expect(migration).toMatch(/IF requester_id IS NULL OR NOT EXISTS \([\s\S]+?conversation\.buyer_id = requester_id OR conversation\.seller_id = requester_id[\s\S]+?\)[\s\S]+?UPDATE public\.messages/i);
    expect(migration).toMatch(/message\.sender_id <> requester_id[\s\S]+?message\.is_read = FALSE/i);
  });

  it("retains Realtime publication membership", () => {
    expect(migration).toMatch(/pg_publication_tables[\s\S]+?tablename = 'messages'[\s\S]+?ALTER PUBLICATION supabase_realtime ADD TABLE public\.messages/i);
  });
});
