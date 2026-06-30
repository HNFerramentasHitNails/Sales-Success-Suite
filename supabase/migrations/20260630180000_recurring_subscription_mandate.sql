-- Task 22 — mandato/consentimento de cobrança recorrente (direito do consumidor).
ALTER TABLE public.recurring_subscriptions
  ADD COLUMN IF NOT EXISTS mandate_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_acknowledged_by uuid;
