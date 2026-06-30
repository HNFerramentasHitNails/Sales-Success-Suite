-- Task 17 — cancelamento de subscrição (unsubscribe) por destinatário.
ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS outreach_leads_unsub_token_idx
  ON public.outreach_leads(unsubscribe_token);
