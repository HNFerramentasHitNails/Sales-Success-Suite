-- Task 20 — endurecer funções SECURITY DEFINER expostas a anon.
-- Revoga EXECUTE de PUBLIC/anon e concede de novo a authenticated apenas às RPC de aplicação.
-- Funções internas/cron/trigger (Grupo B) ficam sem acesso via API (correm via owner/trigger/cron).
DO $$
DECLARE
  r record;
  group_b text[] := ARRAY[
    '_compute_vat_treatment','_generate_nudges_for_org','_wallet_credit_system',
    'cron_generate_daily_nudges','cron_generate_prospect_followups','cron_process_missed_calls','cron_refresh_prospect_scores',
    'outreach_cron_tick','prospects_assign_lead_score','prospects_auto_assign','generate_prospect_followups_for_org',
    'tg_rfm_segments_set_updated_at','trg_calls_recompute_customer_metrics','trg_customers_recompute_vat',
    'trg_order_lines_stock','trg_orders_apply_wallet_campaigns','trg_orders_recompute_customer_metrics',
    'trg_orders_resolve_vat_ins','trg_orders_stock','trg_prospect_convert_on_won'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    IF NOT (r.proname = ANY(group_b)) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
    END IF;
  END LOOP;
END $$;
