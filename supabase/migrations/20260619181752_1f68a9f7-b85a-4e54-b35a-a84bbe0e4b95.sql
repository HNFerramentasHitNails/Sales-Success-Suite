-- 1) Helper: writers (everyone except viewer)
CREATE OR REPLACE FUNCTION public.org_can_write(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.organization_members m
         WHERE m.user_id = auth.uid()
           AND m.organization_id = p_org
           AND m.is_active = true
           AND m.role IN ('owner','admin','sales_director','sales_agent')
      );
$$;

GRANT EXECUTE ON FUNCTION public.org_can_write(uuid) TO authenticated;

-- 2) Upgrade apply_tenant_rls to install 4 granular role-aware policies
CREATE OR REPLACE FUNCTION public.apply_tenant_rls(p_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY;', p_table);

  -- Drop legacy single policy and any previously created granular ones (idempotent)
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation       ON %s;', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_select          ON %s;', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_insert          ON %s;', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_update          ON %s;', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_delete          ON %s;', p_table);

  EXECUTE format(
    'CREATE POLICY tenant_select ON %s FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));',
    p_table);

  EXECUTE format(
    'CREATE POLICY tenant_insert ON %s FOR INSERT TO authenticated WITH CHECK (public.org_can_write(organization_id));',
    p_table);

  EXECUTE format(
    'CREATE POLICY tenant_update ON %s FOR UPDATE TO authenticated USING (public.org_can_write(organization_id)) WITH CHECK (public.org_can_write(organization_id));',
    p_table);

  EXECUTE format(
    'CREATE POLICY tenant_delete ON %s FOR DELETE TO authenticated USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));',
    p_table);
END;
$$;

-- 3) Re-apply to affected tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'agent_instructions','commission_card_items','commission_cards',
    'customer_tag_definitions','customer_tag_links',
    'customer_wallet_transactions','customer_wallets',
    'external_refs','integrations','integration_sync_logs',
    'knowledge_articles','lead_scoring_config',
    'order_issues','order_items','orders',
    'partner_annual_sales','partner_plaques','partners',
    'product_kit_items',
    'reward_campaign_redemptions','reward_campaigns',
    'rma_requests','sales_targets','vouchers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    PERFORM public.apply_tenant_rls(('public.'||t)::regclass);
  END LOOP;
END $$;
