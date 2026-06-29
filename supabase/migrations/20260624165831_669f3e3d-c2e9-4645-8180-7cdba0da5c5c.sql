
ALTER TABLE public.ai_nudges DROP CONSTRAINT IF EXISTS ai_nudges_type_check;
ALTER TABLE public.ai_nudges ADD CONSTRAINT ai_nudges_type_check
  CHECK (type = ANY (ARRAY[
    'purchase_overdue','no_contact','hot_lead','agenda_reminder','subscription_due',
    'prospect_idle','proposal_pending','close_date_due'
  ]::text[]));
