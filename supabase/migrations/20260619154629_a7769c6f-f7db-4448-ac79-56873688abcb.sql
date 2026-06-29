
-- 1) Cards
CREATE TABLE IF NOT EXISTS public.commission_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  period_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aprovado','pago')),
  total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  approved_at timestamptz,
  approved_by uuid,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, period_year, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_cards TO authenticated;
GRANT ALL ON public.commission_cards TO service_role;
SELECT public.apply_tenant_rls('public.commission_cards');
DROP TRIGGER IF EXISTS trg_commission_cards_updated_at ON public.commission_cards;
CREATE TRIGGER trg_commission_cards_updated_at
BEFORE UPDATE ON public.commission_cards
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_commission_cards_org_year ON public.commission_cards(organization_id, period_year);

-- 2) Items
CREATE TABLE IF NOT EXISTS public.commission_card_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.commission_cards(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'invoice' CHECK (source IN ('invoice','manual')),
  description text,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  commission_id uuid REFERENCES public.commissions(id) ON DELETE SET NULL,
  base_amount numeric NOT NULL DEFAULT 0,
  rate_pct numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_card_items TO authenticated;
GRANT ALL ON public.commission_card_items TO service_role;
SELECT public.apply_tenant_rls('public.commission_card_items');
DROP TRIGGER IF EXISTS trg_commission_card_items_updated_at ON public.commission_card_items;
CREATE TRIGGER trg_commission_card_items_updated_at
BEFORE UPDATE ON public.commission_card_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_commission_card_items_card ON public.commission_card_items(card_id);

-- 3) Recalc trigger on items → card total
CREATE OR REPLACE FUNCTION public.recalc_commission_card_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_card uuid;
  v_total numeric;
BEGIN
  v_card := COALESCE(NEW.card_id, OLD.card_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_total FROM public.commission_card_items WHERE card_id = v_card;
  UPDATE public.commission_cards SET total = v_total WHERE id = v_card;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_recalc_card_total ON public.commission_card_items;
CREATE TRIGGER trg_recalc_card_total
AFTER INSERT OR UPDATE OR DELETE ON public.commission_card_items
FOR EACH ROW EXECUTE FUNCTION public.recalc_commission_card_total();
