
CREATE OR REPLACE FUNCTION public.get_team_ranking(_org_id uuid, _from date, _to date)
 RETURNS TABLE(member_id uuid, member_name text, member_email text, total numeric, num_orders integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  IF NOT (public.is_org_admin(_org_id)
          OR public.has_org_role(_org_id, 'sales_director'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH agg AS (
    -- Mapeia orders.assigned_member_id (organization_members.id) → user_id
    SELECT om.user_id                                       AS r_user_id,
           COALESCE(pr.full_name, pr.email, '—')            AS r_member_name,
           pr.email                                          AS r_member_email,
           SUM(o.total)::numeric                             AS r_total,
           COUNT(*)::int                                     AS r_num_orders
      FROM public.orders o
      LEFT JOIN public.organization_members om ON om.id = o.assigned_member_id
      LEFT JOIN public.profiles pr ON pr.id = om.user_id
     WHERE o.organization_id = _org_id
       AND o.status <> 'cancelada'
       AND o.order_date BETWEEN _from AND _to
       AND o.assigned_member_id IS NOT NULL
     GROUP BY om.user_id, pr.full_name, pr.email

    UNION ALL

    -- Preserva a linha "Sem comercial" (encomendas sem responsável atribuído)
    SELECT NULL::uuid                AS r_user_id,
           'Sem comercial'::text     AS r_member_name,
           NULL::text                AS r_member_email,
           SUM(o.total)::numeric     AS r_total,
           COUNT(*)::int             AS r_num_orders
      FROM public.orders o
     WHERE o.organization_id = _org_id
       AND o.status <> 'cancelada'
       AND o.order_date BETWEEN _from AND _to
       AND o.assigned_member_id IS NULL
     HAVING COUNT(*) > 0
  )
  SELECT agg.r_user_id, agg.r_member_name, agg.r_member_email, agg.r_total, agg.r_num_orders
    FROM agg
   ORDER BY agg.r_total DESC;
END;
$function$;
