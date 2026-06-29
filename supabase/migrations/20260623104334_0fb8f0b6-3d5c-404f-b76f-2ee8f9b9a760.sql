
-- =========================================================
-- 1) RLS policies for tables that had RLS but no policy
--    (connection_secrets and runtime_config are service_role-only;
--     adding explicit deny-all policies satisfies the linter
--     without changing behavior — service_role bypasses RLS.)
-- =========================================================
DROP POLICY IF EXISTS "connection_secrets_no_client_access" ON public.connection_secrets;
CREATE POLICY "connection_secrets_no_client_access"
  ON public.connection_secrets
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "runtime_config_no_client_access" ON public.runtime_config;
CREATE POLICY "runtime_config_no_client_access"
  ON public.runtime_config
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

-- =========================================================
-- 2) Revoke EXECUTE on SECURITY DEFINER functions from public/anon
--    Keep authenticated grant where the client legitimately calls it.
--    Trigger functions: revoke from everyone but the owner.
-- =========================================================

-- Helper / RLS predicates (used by policies — authenticated must keep EXECUTE)
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, app_role)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_org_member(uuid)            TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_org_admin(uuid)             TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_org_role(uuid, app_role)   TO authenticated;

-- Client-callable RPCs (keep authenticated)
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_organization(text, text, text, text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_order_number(uuid)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(uuid, date, date)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_sales_evolution(uuid, integer)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_top_customers(uuid, date, date, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_top_products(uuid, date, date, integer)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_team_ranking(uuid, date, date)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_commissions_summary(uuid, date, date)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_commission_detail(uuid, uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_commission_statements(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_commission_statement_paid(uuid)          FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text, text, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_order_number(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(uuid, date, date)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_evolution(uuid, integer)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_customers(uuid, date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_products(uuid, date, date, integer)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_ranking(uuid, date, date)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commissions_summary(uuid, date, date)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commission_detail(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_commission_statements(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_commission_statement_paid(uuid)          TO authenticated;

-- Service-only / trigger-only functions (no client should ever call these)
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_prospect_last_interaction()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_order_totals()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_auto_invoice()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at()                    FROM PUBLIC, anon, authenticated;

-- =========================================================
-- 3) Storage: org-logos bucket
--    - Public CDN reads continue to work (the bucket itself is public,
--      so direct URLs to known objects don't require any policy).
--    - Drop the broad SELECT policy that allowed *listing* files.
--    - Restrict INSERT/UPDATE/DELETE to org owner/admin and limit
--      MIME type + size (<= 2 MB). Files must be stored under
--      a path that starts with "<organization_id>/".
-- =========================================================
DROP POLICY IF EXISTS "org_logos_public_read" ON storage.objects;

-- Authenticated members of the org can read (listing/API). Public CDN URLs still work for everyone.
CREATE POLICY "org_logos_member_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND public.is_org_member(((string_to_array(name, '/'))[1])::uuid)
  );

CREATE POLICY "org_logos_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-logos'
    AND public.is_org_admin(((string_to_array(name, '/'))[1])::uuid)
    AND COALESCE((metadata->>'size')::bigint, 0) <= 2 * 1024 * 1024
    AND lower(COALESCE(metadata->>'mimetype','')) IN (
      'image/png','image/jpeg','image/jpg','image/webp','image/svg+xml','image/gif'
    )
  );

CREATE POLICY "org_logos_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND public.is_org_admin(((string_to_array(name, '/'))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'org-logos'
    AND public.is_org_admin(((string_to_array(name, '/'))[1])::uuid)
    AND COALESCE((metadata->>'size')::bigint, 0) <= 2 * 1024 * 1024
    AND lower(COALESCE(metadata->>'mimetype','')) IN (
      'image/png','image/jpeg','image/jpg','image/webp','image/svg+xml','image/gif'
    )
  );

CREATE POLICY "org_logos_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND public.is_org_admin(((string_to_array(name, '/'))[1])::uuid)
  );
