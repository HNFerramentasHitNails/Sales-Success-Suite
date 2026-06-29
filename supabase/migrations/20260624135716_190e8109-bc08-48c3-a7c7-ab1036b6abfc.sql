
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS low_stock_threshold numeric;

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  delta numeric NOT NULL,
  reason text NOT NULL,
  balance_after numeric,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org ON public.stock_movements(organization_id, created_at DESC);

GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_movements_select ON public.stock_movements;
CREATE POLICY stock_movements_select ON public.stock_movements FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.reconcile_order_stock(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_status order_status; v_org uuid; v_should boolean;
  rec record; v_desired numeric; v_applied numeric; v_diff numeric; v_bal numeric; v_org_eff uuid;
BEGIN
  SELECT status, organization_id INTO v_status, v_org FROM public.orders WHERE id=p_order_id;
  v_should := (v_status IS NOT NULL AND v_status IN ('confirmada','paga','faturada'));
  FOR rec IN
    SELECT DISTINCT pid FROM (
      SELECT ol.product_id AS pid FROM public.order_lines ol JOIN public.products p ON p.id=ol.product_id
        WHERE ol.order_id=p_order_id AND p.tracks_stock=true AND ol.product_id IS NOT NULL
      UNION
      SELECT sm.product_id AS pid FROM public.stock_movements sm WHERE sm.order_id=p_order_id
    ) q WHERE pid IS NOT NULL
  LOOP
    IF v_should THEN
      SELECT COALESCE(SUM(ol.quantity),0) INTO v_desired
        FROM public.order_lines ol JOIN public.products p ON p.id=ol.product_id
       WHERE ol.order_id=p_order_id AND ol.product_id=rec.pid AND p.tracks_stock=true;
    ELSE
      v_desired := 0;
    END IF;
    SELECT COALESCE(-SUM(sm.delta),0) INTO v_applied
      FROM public.stock_movements sm WHERE sm.order_id=p_order_id AND sm.product_id=rec.pid;
    v_diff := v_desired - v_applied;
    IF v_diff <> 0 THEN
      v_org_eff := COALESCE(v_org, (SELECT organization_id FROM public.products WHERE id=rec.pid));
      UPDATE public.products SET stock_quantity = stock_quantity - v_diff, updated_at=now()
        WHERE id=rec.pid RETURNING stock_quantity INTO v_bal;
      INSERT INTO public.stock_movements(organization_id, product_id, order_id, delta, reason, balance_after)
      VALUES (v_org_eff, rec.pid, p_order_id, -v_diff,
              CASE WHEN v_should THEN 'order_committed' ELSE 'order_reverted' END, v_bal);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.trg_orders_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.reconcile_order_stock(NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_orders_stock_after ON public.orders;
CREATE TRIGGER trg_orders_stock_after AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_stock();

CREATE OR REPLACE FUNCTION public.trg_order_lines_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.reconcile_order_stock(COALESCE(NEW.order_id, OLD.order_id)); RETURN COALESCE(NEW, OLD); END $$;
DROP TRIGGER IF EXISTS trg_order_lines_stock_after ON public.order_lines;
CREATE TRIGGER trg_order_lines_stock_after AFTER INSERT OR UPDATE OR DELETE ON public.order_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_lines_stock();

CREATE OR REPLACE FUNCTION public.adjust_product_stock(p_product uuid, p_delta numeric, p_reason text DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_bal numeric;
BEGIN
  SELECT organization_id INTO v_org FROM public.products WHERE id=p_product;
  IF v_org IS NULL THEN RAISE EXCEPTION 'produto não encontrado'; END IF;
  IF NOT public.is_org_member(v_org) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  UPDATE public.products SET stock_quantity = stock_quantity + p_delta, updated_at=now()
    WHERE id=p_product RETURNING stock_quantity INTO v_bal;
  INSERT INTO public.stock_movements(organization_id, product_id, order_id, delta, reason, balance_after, notes, created_by)
  VALUES(v_org, p_product, NULL, p_delta, 'manual_adjustment', v_bal, p_reason, auth.uid());
  RETURN v_bal;
END $$;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid,numeric,text) TO authenticated;
