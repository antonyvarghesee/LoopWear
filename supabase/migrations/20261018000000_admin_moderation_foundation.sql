CREATE TABLE public.user_roles (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_roles_role_check CHECK (role IN ('admin')),
  CONSTRAINT user_roles_user_role_key PRIMARY KEY (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.user_roles TO service_role;

CREATE OR REPLACE FUNCTION public.has_admin_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS user_role
      WHERE user_role.user_id = (SELECT auth.uid())
        AND user_role.role = 'admin'
    );
$$;

REVOKE ALL ON FUNCTION public.has_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_role() TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can read reports" ON public.reports;
CREATE POLICY "Admins can read reports"
  ON public.reports FOR SELECT TO authenticated
  USING (public.has_admin_role());

CREATE INDEX reports_status_created_at_queue_idx
  ON public.reports (status, created_at DESC);
