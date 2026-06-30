-- Task 22 — lembrete antes de cada renovação de subscrição recorrente.
ALTER TABLE public.recurring_subscriptions
  ADD COLUMN IF NOT EXISTS reminder_sent_for date;

CREATE OR REPLACE FUNCTION public.subscription_reminder_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_secret text;
  v_url text := 'https://xijsepmqpjlwmkigsvfl.supabase.co/functions/v1/subscription-reminders';
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'outreach_cron_secret' LIMIT 1;
  IF v_secret IS NULL OR v_secret = '' THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('subscription-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('subscription-reminders', '0 8 * * *', $$SELECT public.subscription_reminder_tick();$$);
