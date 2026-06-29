-- Tabela de regras de comissão
CREATE TABLE public.commission_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  -- Filtros de aplicabilidade (todos opcionais; NULL = aplica a todos)
  user_id UUID,
  product_id UUID,
  product_category TEXT,
  -- Tipo e valor
  rate_type TEXT NOT NULL DEFAULT 'percentage' CHECK (rate_type IN ('percentage','fixed')),
  rate_value NUMERIC NOT NULL DEFAULT 0,
  base TEXT NOT NULL DEFAULT 'line_subtotal' CHECK (base IN ('line_subtotal','line_total','unit_quantity')),
  -- Validade
  valid_from DATE,
  valid_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commission_rules_org ON public.commission_rules(organization_id);
CREATE INDEX idx_commission_rules_priority ON public.commission_rules(organization_id, priority DESC);

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY cr_select_same_org ON public.commission_rules
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));

CREATE POLICY cr_insert_admin ON public.commission_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY cr_update_admin ON public.commission_rules
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY cr_delete_admin ON public.commission_rules
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER trg_cr_touch BEFORE UPDATE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tabela de comissões calculadas
CREATE TABLE public.commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  invoice_item_id UUID,
  user_id UUID NOT NULL,
  rule_id UUID,
  base_amount NUMERIC NOT NULL DEFAULT 0,
  rate_type TEXT NOT NULL,
  rate_value NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','cancelled')),
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commissions_org ON public.commissions(organization_id);
CREATE INDEX idx_commissions_user ON public.commissions(user_id);
CREATE INDEX idx_commissions_invoice ON public.commissions(invoice_id);
CREATE INDEX idx_commissions_status ON public.commissions(organization_id, status);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- Comerciais veem as suas; admins veem todas da org
CREATE POLICY commissions_select_self_or_admin ON public.commissions
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org(auth.uid())
    AND (user_id = auth.uid() OR public.is_org_admin(auth.uid(), organization_id))
  );

CREATE POLICY commissions_insert_admin ON public.commissions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY commissions_update_admin ON public.commissions
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY commissions_delete_admin ON public.commissions
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER trg_commissions_touch BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Função: calcula comissões de uma fatura
-- Estratégia: para cada linha, escolhe a regra ATIVA da org com maior prioridade
-- que corresponda (filtros NULL = wildcard). Comissão atribuída ao comercial
-- responsável pelo cliente (customers.assigned_to). Se não houver, usa imported_by.
CREATE OR REPLACE FUNCTION public.calculate_invoice_commissions(_invoice_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv invoices;
  v_user UUID;
  v_count INTEGER := 0;
  v_item RECORD;
  v_rule commission_rules;
  v_base NUMERIC;
  v_amount NUMERIC;
  v_product_category TEXT;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = _invoice_id;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  -- Apenas admins da org podem disparar este cálculo
  IF NOT is_org_admin(auth.uid(), v_inv.organization_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Determina o comercial: assigned_to do cliente, senão imported_by
  SELECT c.assigned_to INTO v_user
  FROM customers c WHERE c.id = v_inv.customer_id;
  IF v_user IS NULL THEN
    v_user := v_inv.imported_by;
  END IF;
  IF v_user IS NULL THEN
    RETURN 0; -- sem comercial atribuível
  END IF;

  -- Limpa comissões pendentes antigas desta fatura (mantém aprovadas/pagas)
  DELETE FROM commissions
   WHERE invoice_id = _invoice_id AND status = 'pending';

  FOR v_item IN
    SELECT ii.*, p.category
      FROM invoice_items ii
      LEFT JOIN products p ON p.id = ii.product_id
     WHERE ii.invoice_id = _invoice_id
  LOOP
    v_product_category := v_item.category;

    SELECT * INTO v_rule
      FROM commission_rules r
     WHERE r.organization_id = v_inv.organization_id
       AND r.is_active = true
       AND (r.valid_from IS NULL OR r.valid_from <= v_inv.issue_date)
       AND (r.valid_to   IS NULL OR r.valid_to   >= v_inv.issue_date)
       AND (r.user_id IS NULL OR r.user_id = v_user)
       AND (r.product_id IS NULL OR r.product_id = v_item.product_id)
       AND (r.product_category IS NULL OR r.product_category = v_product_category)
     ORDER BY r.priority DESC,
              (r.product_id IS NOT NULL)::int DESC,
              (r.user_id IS NOT NULL)::int DESC,
              (r.product_category IS NOT NULL)::int DESC
     LIMIT 1;

    IF v_rule.id IS NULL THEN
      CONTINUE;
    END IF;

    -- Base de cálculo
    v_base := CASE v_rule.base
      WHEN 'line_subtotal'  THEN v_item.unit_price * v_item.quantity
      WHEN 'line_total'     THEN v_item.line_total
      WHEN 'unit_quantity'  THEN v_item.quantity
      ELSE v_item.line_total
    END;

    v_amount := CASE v_rule.rate_type
      WHEN 'percentage' THEN v_base * v_rule.rate_value / 100.0
      WHEN 'fixed'      THEN v_rule.rate_value * (CASE WHEN v_rule.base = 'unit_quantity' THEN v_item.quantity ELSE 1 END)
      ELSE 0
    END;

    INSERT INTO commissions (
      organization_id, invoice_id, invoice_item_id, user_id, rule_id,
      base_amount, rate_type, rate_value, amount, currency, status
    ) VALUES (
      v_inv.organization_id, _invoice_id, v_item.id, v_user, v_rule.id,
      v_base, v_rule.rate_type, v_rule.rate_value, ROUND(v_amount, 2), v_inv.currency, 'pending'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;