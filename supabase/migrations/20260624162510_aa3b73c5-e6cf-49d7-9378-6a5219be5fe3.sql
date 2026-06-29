-- 1) Tabela de composição (kit -> componentes)
CREATE TABLE IF NOT EXISTS public.product_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kit_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kit_product_id, component_product_id)
);
CREATE INDEX IF NOT EXISTS product_components_kit_idx ON public.product_components(kit_product_id);
CREATE INDEX IF NOT EXISTS product_components_comp_idx ON public.product_components(component_product_id);

GRANT SELECT ON public.product_components TO authenticated;
GRANT ALL ON public.product_components TO service_role;

ALTER TABLE public.product_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pc_sel ON public.product_components;
CREATE POLICY pc_sel ON public.product_components FOR SELECT USING (public.is_org_member(organization_id));

-- 2) Guarda de 1 nível
CREATE OR REPLACE FUNCTION public.trg_product_components_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.kit_product_id = NEW.component_product_id THEN
    RAISE EXCEPTION 'Um kit não pode conter-se a si próprio';
  END IF;
  IF EXISTS (SELECT 1 FROM public.product_components pc WHERE pc.kit_product_id = NEW.component_product_id) THEN
    RAISE EXCEPTION 'Um componente não pode ser, ele próprio, um kit (kits têm 1 nível)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.product_components pc WHERE pc.component_product_id = NEW.kit_product_id) THEN
    RAISE EXCEPTION 'Este produto é usado como componente de outro kit; não pode ser kit (1 nível)';
  END IF;
  IF (SELECT organization_id FROM public.products WHERE id=NEW.component_product_id) <> NEW.organization_id
     OR (SELECT organization_id FROM public.products WHERE id=NEW.kit_product_id) <> NEW.organization_id THEN
    RAISE EXCEPTION 'Produtos de organizações diferentes';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS product_components_guard ON public.product_components;
CREATE TRIGGER product_components_guard BEFORE INSERT OR UPDATE ON public.product_components
  FOR EACH ROW EXECUTE FUNCTION public.trg_product_components_guard();

-- 3) RPC para gravar a composição de um kit (substitui tudo, atómico)
CREATE OR REPLACE FUNCTION public.set_kit_components(p_kit uuid, p_components jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; n int := 0; elem jsonb;
BEGIN
  SELECT organization_id INTO v_org FROM public.products WHERE id=p_kit;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=v_org AND user_id=auth.uid() AND status='active' AND role <> 'read_only') THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  DELETE FROM public.product_components WHERE kit_product_id=p_kit;
  IF p_components IS NOT NULL THEN
    FOR elem IN SELECT * FROM jsonb_array_elements(p_components) LOOP
      INSERT INTO public.product_components(organization_id, kit_product_id, component_product_id, quantity)
      VALUES (v_org, p_kit, (elem->>'component_product_id')::uuid, COALESCE((elem->>'quantity')::numeric,1));
      n := n + 1;
    END LOOP;
  END IF;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.set_kit_components(uuid,jsonb) TO authenticated;

-- 4) reconcile_order_stock: explode kits.
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
      SELECT ol.product_id AS pid
        FROM public.order_lines ol JOIN public.products p ON p.id=ol.product_id
       WHERE ol.order_id=p_order_id AND ol.product_id IS NOT NULL AND p.tracks_stock=true
         AND NOT EXISTS (SELECT 1 FROM public.product_components pc WHERE pc.kit_product_id=ol.product_id)
      UNION
      SELECT pc.component_product_id AS pid
        FROM public.order_lines ol
        JOIN public.product_components pc ON pc.kit_product_id=ol.product_id
        JOIN public.products cp ON cp.id=pc.component_product_id
       WHERE ol.order_id=p_order_id AND ol.product_id IS NOT NULL AND cp.tracks_stock=true
      UNION
      SELECT sm.product_id AS pid FROM public.stock_movements sm WHERE sm.order_id=p_order_id
    ) q WHERE pid IS NOT NULL
  LOOP
    IF v_should THEN
      SELECT COALESCE(SUM(qty),0) INTO v_desired FROM (
        SELECT SUM(ol.quantity) AS qty
          FROM public.order_lines ol JOIN public.products p ON p.id=ol.product_id
         WHERE ol.order_id=p_order_id AND ol.product_id=rec.pid AND p.tracks_stock=true
           AND NOT EXISTS (SELECT 1 FROM public.product_components pc WHERE pc.kit_product_id=ol.product_id)
        UNION ALL
        SELECT SUM(ol.quantity * pc.quantity) AS qty
          FROM public.order_lines ol
          JOIN public.product_components pc ON pc.kit_product_id=ol.product_id
          JOIN public.products cp ON cp.id=pc.component_product_id
         WHERE ol.order_id=p_order_id AND pc.component_product_id=rec.pid AND cp.tracks_stock=true
      ) d;
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