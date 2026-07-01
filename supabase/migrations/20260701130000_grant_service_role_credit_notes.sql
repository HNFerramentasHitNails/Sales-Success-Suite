-- credit_notes e shipping_rules nunca receberam GRANT para o service_role (usado pelas edge
-- functions), apenas para authenticated — causava "permission denied for table credit_notes"
-- na função stripe-refund-credit-note. org_credit_note_counters não tinha nenhum GRANT.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_notes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_credit_note_counters TO service_role, authenticated;
