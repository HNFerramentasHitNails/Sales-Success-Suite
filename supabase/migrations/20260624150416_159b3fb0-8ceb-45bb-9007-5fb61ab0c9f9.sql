
CREATE TABLE IF NOT EXISTS public.rfm_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  color text,
  r_min int, r_max int,
  f_min int, f_max int,
  m_min numeric, m_max numeric,
  priority_for_calls text NOT NULL DEFAULT 'normal',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfm_segments TO authenticated;
GRANT ALL ON public.rfm_segments TO service_role;

ALTER TABLE public.rfm_segments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rfm_segments' AND policyname='rfm_segments_select') THEN
    CREATE POLICY rfm_segments_select ON public.rfm_segments FOR SELECT
      USING (public.is_org_member(organization_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rfm_segments' AND policyname='rfm_segments_insert') THEN
    CREATE POLICY rfm_segments_insert ON public.rfm_segments FOR INSERT
      WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rfm_segments' AND policyname='rfm_segments_update') THEN
    CREATE POLICY rfm_segments_update ON public.rfm_segments FOR UPDATE
      USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role))
      WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rfm_segments' AND policyname='rfm_segments_delete') THEN
    CREATE POLICY rfm_segments_delete ON public.rfm_segments FOR DELETE
      USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'::app_role));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_rfm_segments_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_rfm_segments_updated_at ON public.rfm_segments;
CREATE TRIGGER trg_rfm_segments_updated_at BEFORE UPDATE ON public.rfm_segments
  FOR EACH ROW EXECUTE FUNCTION public.tg_rfm_segments_set_updated_at();

CREATE OR REPLACE FUNCTION public.recompute_customer_segment(_org uuid, _cust uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rec int; v_freq int; v_mon numeric; v_seg text; c record;
BEGIN
  SELECT last_purchase_at, orders_count, total_spent INTO c
    FROM public.customers WHERE id=_cust AND organization_id=_org;
  IF NOT FOUND THEN RETURN; END IF;
  v_rec := CASE WHEN c.last_purchase_at IS NOT NULL THEN (current_date - c.last_purchase_at) ELSE 99999 END;
  v_freq := COALESCE(c.orders_count,0);
  v_mon := COALESCE(c.total_spent,0);
  SELECT s.name INTO v_seg FROM public.rfm_segments s
   WHERE s.organization_id=_org AND s.is_active
     AND (s.r_min IS NULL OR v_rec >= s.r_min) AND (s.r_max IS NULL OR v_rec <= s.r_max)
     AND (s.f_min IS NULL OR v_freq >= s.f_min) AND (s.f_max IS NULL OR v_freq <= s.f_max)
     AND (s.m_min IS NULL OR v_mon >= s.m_min) AND (s.m_max IS NULL OR v_mon <= s.m_max)
   ORDER BY s.sort_order ASC, s.created_at ASC LIMIT 1;
  UPDATE public.customers SET segment = v_seg WHERE id=_cust AND organization_id=_org;
END $$;
GRANT EXECUTE ON FUNCTION public.recompute_customer_segment(uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compute_customer_rfm(_org uuid, _cust uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  PERFORM public.recompute_customer_segment(_org, _cust);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_org_segments(p_org uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; n int:=0;
BEGIN
  IF NOT (public.is_org_admin(p_org) OR public.has_org_role(p_org,'sales_director'::app_role) OR public.is_org_member(p_org)) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  FOR r IN SELECT id FROM public.customers WHERE organization_id=p_org AND is_active LOOP
    PERFORM public.recompute_customer_segment(p_org, r.id); n:=n+1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_org_segments(uuid) TO authenticated, service_role;
