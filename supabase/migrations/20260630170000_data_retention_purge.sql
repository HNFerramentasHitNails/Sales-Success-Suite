-- Task 15 — retenção e minimização: expurgo automático de dados transitórios.
-- NÃO toca em dados de negócio/fiscais (customers, orders, invoices, prospects, sales_calls).
CREATE OR REPLACE FUNCTION public.purge_old_data()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_leads int := 0; v_msgs int := 0; v_inbox int := 0;
BEGIN
  WITH d AS (
    DELETE FROM public.outreach_leads
     WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days'
     RETURNING 1
  ) SELECT count(*) INTO v_leads FROM d;
  WITH d AS (
    DELETE FROM public.outreach_messages
     WHERE created_at < now() - interval '24 months'
     RETURNING 1
  ) SELECT count(*) INTO v_msgs FROM d;
  WITH d AS (
    DELETE FROM public.outreach_inbox_messages
     WHERE created_at < now() - interval '24 months'
     RETURNING 1
  ) SELECT count(*) INTO v_inbox FROM d;
  RETURN jsonb_build_object('purged_leads', v_leads, 'purged_messages', v_msgs, 'purged_inbox', v_inbox, 'at', now());
END $$;
REVOKE ALL ON FUNCTION public.purge_old_data() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-data');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('purge-old-data', '15 3 * * *', $$SELECT public.purge_old_data();$$);
