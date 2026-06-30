-- ===== Envio / Portes — fundação =====
-- Morada de armazém na org, método de envio + custo na encomenda, peso do produto,
-- tabela de regras de portes e RPCs de cálculo/aplicação (linha "Portes de envio").

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS warehouse_name text,
  ADD COLUMN IF NOT EXISTS warehouse_address text,
  ADD COLUMN IF NOT EXISTS warehouse_city text,
  ADD COLUMN IF NOT EXISTS warehouse_postal_code text,
  ADD COLUMN IF NOT EXISTS warehouse_country text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'carrier',
  ADD COLUMN IF NOT EXISTS delivery_carrier text,
  ADD COLUMN IF NOT EXISTS delivery_datetime timestamptz,
  ADD COLUMN IF NOT EXISTS shipping_cost numeric(14,2) NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_method_chk') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_method_chk CHECK (delivery_method IN ('pickup','carrier'));
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight_kg numeric(10,3) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.shipping_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  country text,
  weight_min numeric(10,3),
  weight_max numeric(10,3),
  value_min numeric(14,2),
  value_max numeric(14,2),
  price numeric(14,2) NOT NULL DEFAULT 0,
  free_above numeric(14,2),
  tax_rate numeric(6,3),
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shipping_rules_select ON public.shipping_rules;
CREATE POLICY shipping_rules_select ON public.shipping_rules
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS shipping_rules_write ON public.shipping_rules;
CREATE POLICY shipping_rules_write ON public.shipping_rules
  FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

CREATE OR REPLACE FUNCTION public.compute_order_shipping(_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid; v_method text; v_value numeric; v_country text; v_weight numeric;
  v_rule record;
BEGIN
  SELECT organization_id, delivery_method, COALESCE(subtotal,0), ship_to_country
    INTO v_org, v_method, v_value, v_country
    FROM public.orders WHERE id = _order_id;
  IF v_org IS NULL THEN RETURN 0; END IF;
  IF v_method <> 'carrier' THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(ol.quantity * COALESCE(p.weight_kg,0)),0) INTO v_weight
    FROM public.order_lines ol LEFT JOIN public.products p ON p.id = ol.product_id
   WHERE ol.order_id = _order_id;

  SELECT * INTO v_rule FROM public.shipping_rules r
   WHERE r.organization_id = v_org AND r.is_active = true
     AND (r.country IS NULL OR upper(r.country) = upper(COALESCE(v_country,'')))
     AND (r.weight_min IS NULL OR v_weight >= r.weight_min)
     AND (r.weight_max IS NULL OR v_weight <= r.weight_max)
     AND (r.value_min  IS NULL OR v_value  >= r.value_min)
     AND (r.value_max  IS NULL OR v_value  <= r.value_max)
   ORDER BY r.priority DESC, (r.country IS NOT NULL) DESC, r.created_at ASC
   LIMIT 1;

  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_rule.free_above IS NOT NULL AND v_value >= v_rule.free_above THEN RETURN 0; END IF;
  RETURN COALESCE(v_rule.price, 0);
END
$function$;

CREATE OR REPLACE FUNCTION public.set_order_shipping(_order_id uuid, _amount numeric DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid; v_amount numeric; v_line uuid; v_rate numeric;
BEGIN
  SELECT organization_id INTO v_org FROM public.orders WHERE id = _order_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=v_org AND user_id=auth.uid() AND status='active' AND role <> 'read_only') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_amount := COALESCE(_amount, public.compute_order_shipping(_order_id));
  v_amount := round(COALESCE(v_amount,0), 2);

  SELECT id INTO v_line FROM public.order_lines
   WHERE order_id = _order_id AND product_id IS NULL AND description = 'Portes de envio' LIMIT 1;

  IF v_amount <= 0 THEN
    IF v_line IS NOT NULL THEN DELETE FROM public.order_lines WHERE id = v_line; END IF;
  ELSE
    SELECT COALESCE(tax_rate, 23) INTO v_rate FROM public.shipping_rules
      WHERE organization_id = v_org AND is_active = true ORDER BY priority DESC LIMIT 1;
    v_rate := COALESCE(v_rate, 23);
    IF v_line IS NOT NULL THEN
      UPDATE public.order_lines SET quantity = 1, unit_price = v_amount, tax_rate = v_rate, discount_percent = 0 WHERE id = v_line;
    ELSE
      INSERT INTO public.order_lines(organization_id, order_id, product_id, description, quantity, unit_price, tax_rate, discount_percent)
      VALUES (v_org, _order_id, NULL, 'Portes de envio', 1, v_amount, v_rate, 0);
    END IF;
  END IF;

  UPDATE public.orders SET shipping_cost = v_amount, updated_at = now() WHERE id = _order_id;
  RETURN v_amount;
END
$function$;

GRANT EXECUTE ON FUNCTION public.compute_order_shipping(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_shipping(uuid, numeric) TO authenticated;
