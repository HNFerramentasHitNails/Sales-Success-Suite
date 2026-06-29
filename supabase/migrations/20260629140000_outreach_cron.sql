-- ============================================================
-- OUTREACH — agendamento automático do dispatch worker (pg_cron + pg_net + vault)
-- Seguro: se o segredo do vault não existir, faz no-op (não chama nada).
-- ============================================================

CREATE OR REPLACE FUNCTION public.outreach_cron_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret text;
  v_url text := 'https://xijsepmqpjlwmkigsvfl.supabase.co/functions/v1/outreach-dispatch-worker';
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'outreach_cron_secret' LIMIT 1;
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN; -- ainda não configurado; nada a fazer
  END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
END $$;

-- (re)agendar a cada minuto
DO $$
BEGIN
  PERFORM cron.unschedule('outreach-dispatch');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('outreach-dispatch', '* * * * *', $$SELECT public.outreach_cron_tick();$$);
