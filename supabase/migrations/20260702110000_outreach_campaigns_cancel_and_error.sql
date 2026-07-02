-- Permite cancelar campanhas (estado terminal, distinto de pausada) e regista a última
-- falha (mensagem + hora) quando o disparador as pausa automaticamente por erro repetido.
ALTER TABLE public.outreach_campaigns DROP CONSTRAINT outreach_campaigns_status_check;
ALTER TABLE public.outreach_campaigns ADD CONSTRAINT outreach_campaigns_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'running'::text, 'paused'::text, 'waiting_for_quota'::text, 'completed'::text, 'canceled'::text]));
ALTER TABLE public.outreach_campaigns ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.outreach_campaigns ADD COLUMN IF NOT EXISTS last_error_at timestamptz;
