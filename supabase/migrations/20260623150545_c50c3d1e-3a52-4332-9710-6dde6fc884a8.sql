CREATE OR REPLACE FUNCTION public.get_commission_by_product(_org_id uuid, _from date, _to date)
 RETURNS TABLE(product_id uuid, product_name text, category text, base_total numeric, commission_total numeric, num_lines integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_member_id uuid;
  v_is_privileged boolean;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN RAISE EXCEPTION 'not_a_member'; END IF;
  v_is_privileged := public.is_org_admin(_org_id) OR public.has_org_role(_org_id,'sales_director'::app_role);
  IF NOT v_is_privileged THEN
    SELECT om.id INTO v_caller_member_id FROM public.organization_members om
     WHERE om.organization_id=_org_id AND om.user_id=auth.uid() AND om.status='active' LIMIT 1;
    IF v_caller_member_id IS NULL THEN RAISE EXCEPTION 'not_a_member'; END IF;
  END IF;

  RETURN QUERY
  WITH eligible_rules AS (
    SELECT cr.id, cr.applies_to, cr.product_id, cr.category, cr.member_id, cr.priority, cr.created_at, cr.rate_percent,
           CASE cr.applies_to WHEN 'product' THEN 4 WHEN 'category' THEN 3 WHEN 'member' THEN 2 ELSE 1 END AS r_spec
      FROM public.commission_rules cr
     WHERE cr.organization_id=_org_id AND cr.is_active=true
  ),
  lines AS (
    SELECT ol.id AS r_line_id, ol.line_subtotal AS r_base, o.assigned_member_id AS r_member_id,
           ol.product_id AS r_product_id, p.name AS r_product_name, p.category AS r_category
      FROM public.order_lines ol
      JOIN public.orders o ON o.id=ol.order_id
      LEFT JOIN public.products p ON p.id=ol.product_id
     WHERE o.organization_id=_org_id AND o.status IN ('paga','faturada')
       AND o.order_date BETWEEN _from AND _to
       AND (v_is_privileged OR o.assigned_member_id=v_caller_member_id)
  ),
  line_with_rule AS (
    SELECT l.r_base, l.r_product_id, l.r_product_name, l.r_category,
           (SELECT er.rate_percent FROM eligible_rules er
             WHERE (er.applies_to='all')
                OR (er.applies_to='product'  AND er.product_id=l.r_product_id)
                OR (er.applies_to='category' AND er.category IS NOT NULL AND er.category=l.r_category)
                OR (er.applies_to='member'   AND er.member_id IS NOT NULL AND er.member_id=l.r_member_id)
             ORDER BY er.r_spec DESC, er.priority DESC, er.created_at DESC LIMIT 1) AS r_rate
      FROM lines l
  )
  SELECT lwr.r_product_id,
         COALESCE(lwr.r_product_name,'Sem produto') AS product_name,
         lwr.r_category,
         COALESCE(SUM(lwr.r_base),0)::numeric AS base_total,
         COALESCE(SUM(lwr.r_base*COALESCE(lwr.r_rate,0)/100.0),0)::numeric AS commission_total,
         COUNT(*)::int AS num_lines
    FROM line_with_rule lwr
   GROUP BY lwr.r_product_id, lwr.r_product_name, lwr.r_category
   ORDER BY commission_total DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_commission_by_product(uuid,date,date) TO authenticated;