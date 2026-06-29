
CREATE TABLE IF NOT EXISTS public.sales_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year int NOT NULL,
  member_id uuid REFERENCES public.organization_members(id) ON DELETE CASCADE,
  metric text NOT NULL DEFAULT 'vendas' CHECK (metric IN ('vendas','faturado')),
  annual_target numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_objectives TO authenticated;
GRANT ALL ON public.sales_objectives TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS sales_objectives_uniq
  ON public.sales_objectives (organization_id, year, metric, COALESCE(member_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS public.sales_objective_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid NOT NULL REFERENCES public.sales_objectives(id) ON DELETE CASCADE,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  target numeric(14,2) NOT NULL DEFAULT 0,
  UNIQUE(objective_id, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_objective_months TO authenticated;
GRANT ALL ON public.sales_objective_months TO service_role;

ALTER TABLE public.sales_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_objective_months ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS so_sel ON public.sales_objectives;
CREATE POLICY so_sel ON public.sales_objectives FOR SELECT USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS so_ins ON public.sales_objectives;
CREATE POLICY so_ins ON public.sales_objectives FOR INSERT WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
DROP POLICY IF EXISTS so_upd ON public.sales_objectives;
CREATE POLICY so_upd ON public.sales_objectives FOR UPDATE USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));
DROP POLICY IF EXISTS so_del ON public.sales_objectives;
CREATE POLICY so_del ON public.sales_objectives FOR DELETE USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id,'sales_director'));

DROP POLICY IF EXISTS som_sel ON public.sales_objective_months;
CREATE POLICY som_sel ON public.sales_objective_months FOR SELECT USING (EXISTS (SELECT 1 FROM public.sales_objectives o WHERE o.id=objective_id AND public.is_org_member(o.organization_id)));
DROP POLICY IF EXISTS som_wr ON public.sales_objective_months;
CREATE POLICY som_wr ON public.sales_objective_months FOR ALL USING (EXISTS (SELECT 1 FROM public.sales_objectives o WHERE o.id=objective_id AND (public.is_org_admin(o.organization_id) OR public.has_org_role(o.organization_id,'sales_director')))) WITH CHECK (EXISTS (SELECT 1 FROM public.sales_objectives o WHERE o.id=objective_id AND (public.is_org_admin(o.organization_id) OR public.has_org_role(o.organization_id,'sales_director'))));

CREATE OR REPLACE FUNCTION public.set_sales_objective(_org_id uuid, _year int, _member_id uuid, _metric text, _annual numeric, _months jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obj uuid; v_month int; v_target numeric;
BEGIN
  IF NOT (public.is_org_admin(_org_id) OR public.has_org_role(_org_id,'sales_director')) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  IF _metric NOT IN ('vendas','faturado') THEN RAISE EXCEPTION 'métrica inválida'; END IF;
  IF _member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_members WHERE id=_member_id AND organization_id=_org_id) THEN
    RAISE EXCEPTION 'comercial inválido';
  END IF;

  SELECT id INTO v_obj FROM public.sales_objectives
   WHERE organization_id=_org_id AND year=_year AND metric=_metric
     AND COALESCE(member_id,'00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(_member_id,'00000000-0000-0000-0000-000000000000'::uuid);
  IF v_obj IS NULL THEN
    INSERT INTO public.sales_objectives(organization_id, year, member_id, metric, annual_target, created_by)
    VALUES (_org_id, _year, _member_id, _metric, COALESCE(_annual,0), auth.uid())
    RETURNING id INTO v_obj;
  ELSE
    UPDATE public.sales_objectives SET annual_target=COALESCE(_annual,0), updated_at=now() WHERE id=v_obj;
  END IF;

  IF _months IS NOT NULL THEN
    FOR v_month, v_target IN
      SELECT (elem->>'month')::int, COALESCE((elem->>'target')::numeric,0)
        FROM jsonb_array_elements(_months) elem
    LOOP
      IF v_month BETWEEN 1 AND 12 THEN
        INSERT INTO public.sales_objective_months(objective_id, month, target)
        VALUES (v_obj, v_month, v_target)
        ON CONFLICT (objective_id, month) DO UPDATE SET target=EXCLUDED.target;
      END IF;
    END LOOP;
  END IF;

  RETURN v_obj;
END $$;
GRANT EXECUTE ON FUNCTION public.set_sales_objective(uuid,int,uuid,text,numeric,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_objective_progress(_org_id uuid, _year int, _member_id uuid, _metric text)
RETURNS TABLE(month int, target numeric, actual numeric, actual_prev numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_obj uuid;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN RAISE EXCEPTION 'not_a_member'; END IF;

  SELECT id INTO v_obj FROM public.sales_objectives
   WHERE organization_id=_org_id AND year=_year AND metric=_metric
     AND COALESCE(member_id,'00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(_member_id,'00000000-0000-0000-0000-000000000000'::uuid);

  RETURN QUERY
  WITH mm AS (SELECT generate_series(1,12) AS m),
  tgt AS (
    SELECT som.month AS m, som.target FROM public.sales_objective_months som WHERE som.objective_id = v_obj
  ),
  src AS (
    SELECT o.order_date AS d, EXTRACT(YEAR FROM o.order_date)::int AS yr, o.subtotal AS val
      FROM public.orders o
     WHERE _metric='vendas' AND o.organization_id=_org_id AND o.status <> 'cancelada'
       AND EXTRACT(YEAR FROM o.order_date) IN (_year, _year-1)
       AND (_member_id IS NULL OR o.assigned_member_id = _member_id)
    UNION ALL
    SELECT i.issued_at::date AS d, EXTRACT(YEAR FROM i.issued_at)::int AS yr, i.subtotal AS val
      FROM public.invoices i
      LEFT JOIN public.orders o2 ON o2.id = i.order_id
     WHERE _metric='faturado' AND i.organization_id=_org_id AND i.status='issued'
       AND EXTRACT(YEAR FROM i.issued_at) IN (_year, _year-1)
       AND (_member_id IS NULL OR o2.assigned_member_id = _member_id)
  ),
  act AS (
    SELECT EXTRACT(MONTH FROM d)::int AS m,
           SUM(val) FILTER (WHERE yr = _year)   AS cur,
           SUM(val) FILTER (WHERE yr = _year-1) AS prev
      FROM src GROUP BY 1
  )
  SELECT mm.m, COALESCE(tgt.target,0)::numeric, COALESCE(act.cur,0)::numeric, COALESCE(act.prev,0)::numeric
    FROM mm LEFT JOIN tgt ON tgt.m=mm.m LEFT JOIN act ON act.m=mm.m
   ORDER BY mm.m;
END $$;
GRANT EXECUTE ON FUNCTION public.get_objective_progress(uuid,int,uuid,text) TO authenticated;
