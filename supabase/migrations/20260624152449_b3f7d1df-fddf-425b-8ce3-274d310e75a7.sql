CREATE TABLE IF NOT EXISTS public.class_upgrade_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_class_id uuid NOT NULL REFERENCES public.customer_classes(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('total_spent','orders_count')),
  threshold numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_upgrade_rules TO authenticated;
GRANT ALL ON public.class_upgrade_rules TO service_role;
ALTER TABLE public.class_upgrade_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='class_upgrade_rules' AND policyname='cur_select') THEN
    CREATE POLICY cur_select ON public.class_upgrade_rules FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='class_upgrade_rules' AND policyname='cur_insert') THEN
    CREATE POLICY cur_insert ON public.class_upgrade_rules FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='class_upgrade_rules' AND policyname='cur_update') THEN
    CREATE POLICY cur_update ON public.class_upgrade_rules FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director')) WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='class_upgrade_rules' AND policyname='cur_delete') THEN
    CREATE POLICY cur_delete ON public.class_upgrade_rules FOR DELETE TO authenticated USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_class_upgrade_rules_updated ON public.class_upgrade_rules;
CREATE TRIGGER trg_class_upgrade_rules_updated BEFORE UPDATE ON public.class_upgrade_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.recompute_customer_class(_org uuid, _cust uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ts numeric; v_oc int; v_cur uuid; v_cur_disc numeric; v_earned uuid; v_earned_disc numeric;
BEGIN
  SELECT total_spent, orders_count, customer_class_id INTO v_ts, v_oc, v_cur
    FROM public.customers WHERE id=_cust AND organization_id=_org;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT r.target_class_id, tc.default_discount_percent INTO v_earned, v_earned_disc
    FROM public.class_upgrade_rules r JOIN public.customer_classes tc ON tc.id=r.target_class_id
   WHERE r.organization_id=_org AND r.is_active
     AND ((r.metric='total_spent' AND COALESCE(v_ts,0) >= r.threshold)
       OR (r.metric='orders_count' AND COALESCE(v_oc,0) >= r.threshold))
   ORDER BY tc.default_discount_percent DESC, r.threshold DESC LIMIT 1;
  IF v_earned IS NULL THEN RETURN; END IF;
  v_cur_disc := CASE WHEN v_cur IS NOT NULL THEN (SELECT default_discount_percent FROM public.customer_classes WHERE id=v_cur) ELSE NULL END;
  IF v_cur IS NULL OR v_earned_disc > COALESCE(v_cur_disc,-1) THEN
    UPDATE public.customers SET customer_class_id=v_earned WHERE id=_cust AND organization_id=_org;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.recompute_customer_class(uuid,uuid) TO authenticated, service_role;

-- Re-create compute_customer_rfm to add upgrade hook before segment recompute
CREATE OR REPLACE FUNCTION public.compute_customer_rfm(_org uuid, _cust uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  c RECORD;
  v_days_since int;
  v_ratio numeric;
  v_r int; v_f int; v_m int;
  v_score int; v_overdue int;
  v_churn text; v_phase text; v_orders int;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = _cust AND organization_id = _org;
  IF NOT FOUND THEN RETURN; END IF;

  IF c.last_purchase_at IS NOT NULL THEN
    v_days_since := (current_date - c.last_purchase_at);
  ELSE v_days_since := NULL; END IF;

  IF v_days_since IS NULL THEN v_r := 1;
  ELSIF COALESCE(c.avg_recurrence_days, 0) > 0 THEN
    v_ratio := v_days_since::numeric / c.avg_recurrence_days::numeric;
    v_r := CASE
      WHEN v_ratio <= 1   THEN 5
      WHEN v_ratio <= 1.5 THEN 4
      WHEN v_ratio <= 2   THEN 3
      WHEN v_ratio <= 3   THEN 2
      ELSE 1 END;
  ELSE
    v_r := CASE
      WHEN v_days_since <= 30  THEN 5
      WHEN v_days_since <= 60  THEN 4
      WHEN v_days_since <= 120 THEN 3
      WHEN v_days_since <= 240 THEN 2
      ELSE 1 END;
  END IF;

  v_orders := COALESCE(c.orders_count, 0);
  v_f := CASE
    WHEN v_orders >= 10 THEN 5
    WHEN v_orders >= 5  THEN 4
    WHEN v_orders >= 3  THEN 3
    WHEN v_orders >= 2  THEN 2
    ELSE 1 END;

  v_m := CASE
    WHEN COALESCE(c.total_spent, 0) >= 5000 THEN 5
    WHEN COALESCE(c.total_spent, 0) >= 1500 THEN 4
    WHEN COALESCE(c.total_spent, 0) >= 500  THEN 3
    WHEN COALESCE(c.total_spent, 0) >= 100  THEN 2
    ELSE 1 END;

  v_score := round(((v_r + v_f + v_m)::numeric / 15.0) * 100);

  IF c.next_purchase_expected_at IS NOT NULL THEN
    v_overdue := (current_date - c.next_purchase_expected_at);
  ELSE v_overdue := NULL; END IF;

  v_churn := CASE
    WHEN v_overdue IS NULL OR v_overdue <= 0 THEN 'baixo'
    WHEN v_overdue <= 15 THEN 'medio'
    WHEN v_overdue <= 45 THEN 'alto'
    ELSE 'critico' END;

  IF v_orders = 0 THEN v_phase := 'novo';
  ELSIF v_overdue IS NOT NULL AND v_overdue > 180 AND v_churn = 'critico' THEN v_phase := 'inativo';
  ELSIF v_churn IN ('alto','critico') THEN v_phase := 'em_risco';
  ELSIF v_orders <= 2 THEN v_phase := 'entrada';
  ELSE v_phase := 'recorrente';
  END IF;

  UPDATE public.customers
     SET rfm_recency = v_r, rfm_frequency = v_f, rfm_monetary = v_m,
         rfm_score = v_score, churn_risk = v_churn, overdue_days = v_overdue,
         lifecycle_phase = v_phase, rfm_computed_at = now()
   WHERE id = _cust AND organization_id = _org;

  PERFORM public.recompute_customer_class(_org, _cust);
  PERFORM public.recompute_customer_segment(_org, _cust);
END;
$$;

CREATE OR REPLACE FUNCTION public.next_class_upgrade(p_customer_id uuid)
RETURNS TABLE(class_name text, discount numeric, metric text, remaining numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_ts numeric; v_oc int; v_cur uuid; v_cur_disc numeric;
BEGIN
  SELECT organization_id, total_spent, orders_count, customer_class_id INTO v_org, v_ts, v_oc, v_cur
    FROM public.customers WHERE id=p_customer_id;
  IF v_org IS NULL OR NOT public.is_org_member(v_org) THEN RETURN; END IF;
  v_cur_disc := CASE WHEN v_cur IS NOT NULL THEN (SELECT default_discount_percent FROM public.customer_classes WHERE id=v_cur) ELSE -1 END;
  RETURN QUERY
    SELECT tc.name, tc.default_discount_percent, r.metric,
           (CASE WHEN r.metric='total_spent' THEN r.threshold - COALESCE(v_ts,0)
                 ELSE r.threshold - COALESCE(v_oc,0) END) AS remaining
      FROM public.class_upgrade_rules r JOIN public.customer_classes tc ON tc.id=r.target_class_id
     WHERE r.organization_id=v_org AND r.is_active
       AND tc.default_discount_percent > COALESCE(v_cur_disc,-1)
       AND (CASE WHEN r.metric='total_spent' THEN r.threshold - COALESCE(v_ts,0)
                 ELSE r.threshold - COALESCE(v_oc,0) END) > 0
     ORDER BY remaining ASC
     LIMIT 1;
END $$;
GRANT EXECUTE ON FUNCTION public.next_class_upgrade(uuid) TO authenticated, service_role;