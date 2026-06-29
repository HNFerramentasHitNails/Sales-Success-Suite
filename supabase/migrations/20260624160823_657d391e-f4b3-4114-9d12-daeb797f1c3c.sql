CREATE OR REPLACE FUNCTION public.get_team_objective_attainment(_org_id uuid, _year int, _metric text)
RETURNS TABLE(member_id uuid, member_name text, meta numeric, realizado numeric, pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_org_member(_org_id) THEN RAISE EXCEPTION 'not_a_member'; END IF;
  IF NOT (public.is_org_admin(_org_id) OR public.has_org_role(_org_id,'sales_director')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _metric NOT IN ('vendas','faturado') THEN RAISE EXCEPTION 'métrica inválida'; END IF;

  RETURN QUERY
  WITH mem AS (
    SELECT om.id AS mid, COALESCE(pr.full_name, pr.email, '—') AS mname
      FROM public.organization_members om
      LEFT JOIN public.profiles pr ON pr.id = om.user_id
     WHERE om.organization_id = _org_id AND om.status='active'
  ),
  meta AS (
    SELECT so.member_id AS mid, so.annual_target AS meta
      FROM public.sales_objectives so
     WHERE so.organization_id=_org_id AND so.year=_year AND so.metric=_metric AND so.member_id IS NOT NULL
  ),
  src AS (
    SELECT o.assigned_member_id AS mid, o.subtotal AS r
      FROM public.orders o
     WHERE _metric='vendas' AND o.organization_id=_org_id AND o.status<>'cancelada'
       AND EXTRACT(YEAR FROM o.order_date)=_year AND o.assigned_member_id IS NOT NULL
    UNION ALL
    SELECT o2.assigned_member_id AS mid, i.subtotal AS r
      FROM public.invoices i JOIN public.orders o2 ON o2.id=i.order_id
     WHERE _metric='faturado' AND i.organization_id=_org_id AND i.status='issued'
       AND EXTRACT(YEAR FROM i.issued_at)=_year AND o2.assigned_member_id IS NOT NULL
  ),
  real_agg AS (SELECT mid, SUM(r) AS r FROM src GROUP BY mid)
  SELECT mem.mid, mem.mname,
         COALESCE(meta.meta,0)::numeric,
         COALESCE(real_agg.r,0)::numeric,
         CASE WHEN COALESCE(meta.meta,0) > 0 THEN (COALESCE(real_agg.r,0)/meta.meta) ELSE NULL END
    FROM mem
    LEFT JOIN meta ON meta.mid=mem.mid
    LEFT JOIN real_agg ON real_agg.mid=mem.mid
   ORDER BY COALESCE(real_agg.r,0) DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.get_team_objective_attainment(uuid,int,text) TO authenticated;