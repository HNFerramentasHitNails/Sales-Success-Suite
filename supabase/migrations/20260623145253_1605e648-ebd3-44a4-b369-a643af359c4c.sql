
CREATE TABLE public.commission_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  label text NOT NULL,
  amount numeric(14,2) NOT NULL,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commission_adjustments_org_member_period_idx
  ON public.commission_adjustments (organization_id, member_id, period_start, period_end);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_adjustments TO authenticated;
GRANT ALL ON public.commission_adjustments TO service_role;

ALTER TABLE public.commission_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read commission adjustments" ON public.commission_adjustments
  FOR SELECT TO authenticated USING (
    public.is_org_member(organization_id) AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR EXISTS (SELECT 1 FROM public.organization_members om
                  WHERE om.id = commission_adjustments.member_id AND om.user_id = auth.uid())
    )
  );
CREATE POLICY "insert commission adjustments" ON public.commission_adjustments
  FOR INSERT TO authenticated WITH CHECK (
    public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );
CREATE POLICY "update commission adjustments" ON public.commission_adjustments
  FOR UPDATE TO authenticated USING (
    public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)
  ) WITH CHECK (
    public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );
CREATE POLICY "delete commission adjustments" ON public.commission_adjustments
  FOR DELETE TO authenticated USING (
    public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );

CREATE TRIGGER commission_adjustments_touch_updated_at
  BEFORE UPDATE ON public.commission_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ====== get_commissions_summary: incluir ajustes ======
CREATE OR REPLACE FUNCTION public.get_commissions_summary(_org_id uuid, _from date, _to date)
 RETURNS TABLE(member_id uuid, member_name text, base_total numeric, commission_total numeric, num_orders integer)
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
    SELECT ol.id AS r_line_id, ol.line_subtotal AS r_base, o.id AS r_order_id,
           o.assigned_member_id AS r_member_id, ol.product_id AS r_product_id, p.category AS r_category
      FROM public.order_lines ol
      JOIN public.orders o ON o.id=ol.order_id
      LEFT JOIN public.products p ON p.id=ol.product_id
     WHERE o.organization_id=_org_id AND o.status IN ('paga','faturada')
       AND o.order_date BETWEEN _from AND _to
       AND (v_is_privileged OR o.assigned_member_id=v_caller_member_id)
  ),
  line_with_rule AS (
    SELECT l.r_line_id, l.r_base, l.r_order_id, l.r_member_id,
           (SELECT er.rate_percent FROM eligible_rules er
             WHERE (er.applies_to='all')
                OR (er.applies_to='product'  AND er.product_id=l.r_product_id)
                OR (er.applies_to='category' AND er.category IS NOT NULL AND er.category=l.r_category)
                OR (er.applies_to='member'   AND er.member_id IS NOT NULL AND er.member_id=l.r_member_id)
             ORDER BY er.r_spec DESC, er.priority DESC, er.created_at DESC LIMIT 1) AS r_rate
      FROM lines l
  ),
  order_agg AS (
    SELECT lwr.r_member_id AS m_id,
           COALESCE(SUM(lwr.r_base),0)::numeric AS base_total,
           COALESCE(SUM(lwr.r_base*COALESCE(lwr.r_rate,0)/100.0),0)::numeric AS commission_total,
           COUNT(DISTINCT lwr.r_order_id)::int AS num_orders
      FROM line_with_rule lwr GROUP BY lwr.r_member_id
  ),
  adj_agg AS (
    SELECT ca.member_id AS m_id, COALESCE(SUM(ca.amount),0)::numeric AS adj_total
      FROM public.commission_adjustments ca
     WHERE ca.organization_id=_org_id AND ca.period_start=_from AND ca.period_end=_to
       AND (v_is_privileged OR ca.member_id=v_caller_member_id)
     GROUP BY ca.member_id
  ),
  combined AS (
    SELECT COALESCE(o.m_id,a.m_id) AS m_id,
           COALESCE(o.base_total,0) AS base_total,
           COALESCE(o.commission_total,0)+COALESCE(a.adj_total,0) AS commission_total,
           COALESCE(o.num_orders,0) AS num_orders
      FROM order_agg o FULL OUTER JOIN adj_agg a ON a.m_id=o.m_id
  )
  SELECT c.m_id, COALESCE(pr.full_name, pr.email, 'Sem comercial') AS member_name,
         c.base_total, c.commission_total, c.num_orders
    FROM combined c
    LEFT JOIN public.organization_members om ON om.id=c.m_id
    LEFT JOIN public.profiles pr ON pr.id=om.user_id
   WHERE c.num_orders > 0 OR c.commission_total <> 0
   ORDER BY c.commission_total DESC;
END;
$function$;

-- ====== generate_commission_statements: incluir ajustes ======
CREATE OR REPLACE FUNCTION public.generate_commission_statements(_org_id uuid, _from date, _to date)
 RETURNS TABLE(id uuid, member_id uuid, member_name text, base_total numeric, commission_total numeric, status commission_statement_status, generated_at timestamp with time zone, paid_at timestamp with time zone, was_skipped boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  IF NOT (public.is_org_admin(_org_id)
          OR public.has_org_role(_org_id, 'sales_director'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH eligible_rules AS (
    SELECT cr.id, cr.applies_to, cr.product_id, cr.category,
           cr.member_id, cr.priority, cr.created_at, cr.rate_percent,
           CASE cr.applies_to
             WHEN 'product'  THEN 4
             WHEN 'category' THEN 3
             WHEN 'member'   THEN 2
             ELSE 1 END AS r_spec
      FROM public.commission_rules cr
     WHERE cr.organization_id = _org_id
       AND cr.is_active = true
  ),
  lines AS (
    SELECT ol.id AS r_line_id,
           ol.line_subtotal AS r_base,
           o.assigned_member_id AS r_member_id,
           ol.product_id AS r_product_id,
           p.category AS r_category
      FROM public.order_lines ol
      JOIN public.orders o ON o.id = ol.order_id
      LEFT JOIN public.products p ON p.id = ol.product_id
     WHERE o.organization_id = _org_id
       AND o.status IN ('paga','faturada')
       AND o.order_date BETWEEN _from AND _to
       AND o.assigned_member_id IS NOT NULL
  ),
  line_with_rule AS (
    SELECT l.r_member_id, l.r_base,
           (SELECT er.rate_percent
              FROM eligible_rules er
             WHERE (er.applies_to = 'all')
                OR (er.applies_to = 'product'  AND er.product_id = l.r_product_id)
                OR (er.applies_to = 'category' AND er.category IS NOT NULL AND er.category = l.r_category)
                OR (er.applies_to = 'member'   AND er.member_id IS NOT NULL AND er.member_id = l.r_member_id)
             ORDER BY er.r_spec DESC, er.priority DESC, er.created_at DESC
             LIMIT 1) AS r_rate
      FROM lines l
  ),
  order_agg AS (
    SELECT r_member_id AS m_id,
           SUM(r_base)::numeric(14,2) AS base_total,
           SUM(r_base * COALESCE(r_rate,0) / 100.0)::numeric(14,2) AS order_commission
      FROM line_with_rule
     GROUP BY r_member_id
  ),
  adj_agg AS (
    SELECT ca.member_id AS m_id,
           SUM(ca.amount)::numeric(14,2) AS adj_total
      FROM public.commission_adjustments ca
     WHERE ca.organization_id = _org_id
       AND ca.period_start = _from
       AND ca.period_end = _to
     GROUP BY ca.member_id
  ),
  agg AS (
    SELECT COALESCE(o.m_id, a.m_id) AS r_member_id,
           COALESCE(o.base_total, 0)::numeric(14,2) AS base_total,
           (COALESCE(o.order_commission, 0) + COALESCE(a.adj_total, 0))::numeric(14,2) AS commission_total
      FROM order_agg o
      FULL OUTER JOIN adj_agg a ON a.m_id = o.m_id
     WHERE COALESCE(o.m_id, a.m_id) IS NOT NULL
       AND (COALESCE(o.order_commission, 0) + COALESCE(a.adj_total, 0)) <> 0
  ),
  upserted AS (
    INSERT INTO public.commission_statements AS cs
      (organization_id, member_id, period_start, period_end,
       base_total, commission_total, status, generated_at, generated_by)
    SELECT _org_id, a.r_member_id, _from, _to,
           a.base_total, a.commission_total, 'pendente', now(), v_uid
      FROM agg a
    ON CONFLICT (organization_id, member_id, period_start, period_end)
    DO UPDATE SET
       base_total = CASE WHEN cs.status = 'paga' THEN cs.base_total ELSE EXCLUDED.base_total END,
       commission_total = CASE WHEN cs.status = 'paga' THEN cs.commission_total ELSE EXCLUDED.commission_total END,
       generated_at = CASE WHEN cs.status = 'paga' THEN cs.generated_at ELSE now() END,
       generated_by = CASE WHEN cs.status = 'paga' THEN cs.generated_by ELSE v_uid END
    RETURNING cs.id, cs.member_id, cs.base_total, cs.commission_total,
              cs.status, cs.generated_at, cs.paid_at,
              (cs.status = 'paga') AS was_skipped
  )
  SELECT s.id, s.member_id,
         COALESCE(pr.full_name, pr.email, 'Sem comercial') AS member_name,
         s.base_total, s.commission_total, s.status,
         s.generated_at, s.paid_at,
         (s.status = 'paga' AND NOT EXISTS (SELECT 1 FROM agg a WHERE a.r_member_id = s.member_id)) AS was_skipped
    FROM (SELECT * FROM upserted
          UNION
          SELECT cs.id, cs.member_id, cs.base_total, cs.commission_total,
                 cs.status, cs.generated_at, cs.paid_at,
                 false
            FROM public.commission_statements cs
           WHERE cs.organization_id = _org_id
             AND cs.period_start = _from
             AND cs.period_end = _to
         ) s
    LEFT JOIN public.organization_members om ON om.id = s.member_id
    LEFT JOIN public.profiles pr ON pr.id = om.user_id
    ORDER BY commission_total DESC;
END;
$function$;
