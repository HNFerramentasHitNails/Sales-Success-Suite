
ALTER TABLE public.sales_calls
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_calls_priority_check'
  ) THEN
    ALTER TABLE public.sales_calls
      ADD CONSTRAINT sales_calls_priority_check
      CHECK (priority IN ('normal','high','urgent'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cron_process_missed_calls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.sales_calls
     SET priority = CASE
                      WHEN priority = 'normal' THEN 'high'
                      WHEN priority = 'high' THEN 'urgent'
                      ELSE 'urgent'
                    END,
         scheduled_for = (current_date::timestamp + scheduled_for::time),
         status = 'rescheduled'
   WHERE status IN ('pending','rescheduled')
     AND scheduled_for IS NOT NULL
     AND scheduled_for::date < current_date;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

DO $$ BEGIN
  PERFORM cron.unschedule('daily-missed-calls');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'daily-missed-calls',
  '0 5 * * *',
  $$ SELECT public.cron_process_missed_calls(); $$
);
