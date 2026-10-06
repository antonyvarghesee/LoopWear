import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261018000000_admin_moderation_foundation.sql"),
  "utf8",
);
const adminClient = readFileSync(join(process.cwd(), "src/lib/supabase/admin.ts"), "utf8");
const reportsService = readFileSync(join(process.cwd(), "src/services/admin-reports.ts"), "utf8");
const adminPage = readFileSync(join(process.cwd(), "src/app/admin/page.tsx"), "utf8");

describe("Phase 14A admin foundation migration contract", () => {
  it("protects the single supported admin role with RLS and service-role-only writes", () => {
    expect(migration).toMatch(/CREATE TABLE public\.user_roles/i);
    expect(migration).toMatch(/PRIMARY KEY \(user_id, role\)/i);
    expect(migration).toMatch(/CHECK \(role IN \('admin'\)\)/i);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.user_roles FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT ALL PRIVILEGES ON TABLE public\.user_roles TO service_role/i);
  });

  it("derives admin identity from auth.uid with a fixed search path", () => {
    expect(migration).toMatch(/FUNCTION public\.has_admin_role\(\)/i);
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public, auth/i);
    expect(migration).toMatch(/user_role\.user_id = \(SELECT auth\.uid\(\)\)[\s\S]*?user_role\.role = 'admin'/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.has_admin_role\(\) FROM PUBLIC, anon/i);
  });

  it("adds an admin-only report read policy without granting report updates", () => {
    expect(migration).toMatch(/CREATE POLICY "Admins can read reports"[\s\S]*?FOR SELECT TO authenticated[\s\S]*?public\.has_admin_role\(\)/i);
    expect(migration).not.toMatch(/GRANT UPDATE[^;]*public\.reports/i);
    expect(reportsService).not.toMatch(/\.update\(|\.delete\(|\.insert\(/);
  });

  it("protects the elevated client module from client-side imports", () => {
    expect(adminClient.startsWith('import "server-only";')).toBe(true);
  });

  it("guards the admin route before rendering its foundation page", () => {
    expect(adminPage).toMatch(/await requireAdmin\(\)/);
  });
});
