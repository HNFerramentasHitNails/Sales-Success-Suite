
-- 1) Tabela
CREATE TABLE public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  rate_percent numeric(6,3) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  applies_to text NOT NULL CHECK (applies_to IN ('all','product','category','member')),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  category text,
  member_id uuid REFERENCES public.organization_members(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_commission_rules_org ON public.commission_rules(organization_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_rules TO authenticated;
GRANT ALL ON public.commission_rules TO service_role;

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rules visible to org members"
  ON public.commission_rules FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "rules manage by admin/director"
  ON public.commission_rules FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );

CREATE POLICY "rules update by admin/director"
  ON public.commission_rules FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );

CREATE POLICY "rules delete by admin/director"
  ON public.commission_rules FOR DELETE TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );

CREATE TRIGGER tr_commission_rules_touch
  BEFORE UPDATE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Resumo por comercial
CREATE OR REPLACE FUNCTION public.get_commissions_summary(
  _org_id uuid, _from date, _to date
) RETURNS TABLE(
  member_id uuid,
  member_name text,
  base_total numeric,
  commission_total numeric,
  num_orders integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_member_id uuid;
  v_is_privileged boolean;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  v_is_privileged := public.is_org_admin(_org_id)
                  OR public.has_org_role(_org_id, 'sales_director'::app_role);

  IF NOT v_is_privileged THEN
    SELECT om.id INTO v_caller_member_id
      FROM public.organization_members om
     WHERE om.organization_id = _org_id
       AND om.user_id = auth.uid()
       AND om.status = 'active'
     LIMIT 1;
    IF v_caller_member_id IS NULL THEN
      RAISE EXCEPTION 'not_a_member';
    END IF;
  END IF;

  RETURN QUERY
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
           o.id AS r_order_id,
           o.assigned_member_id AS r_member_id,
           ol.product_id AS r_product_id,
           p.category AS r_category,
           o.organization_id AS r_org
      FROM public.order_lines ol
      JOIN public.orders o ON o.id = ol.order_id
      LEFT JOIN public.products p ON p.id = ol.product_id
     WHERE o.organization_id = _org_id
       AND o.status IN ('paga','faturada')
       AND o.order_date BETWEEN _from AND _to
       AND (v_is_privileged OR o.assigned_member_id = v_caller_member_id)
  ),
  line_with_rule AS (
    SELECT l.r_line_id, l.r_base, l.r_order_id, l.r_member_id,
           (SELECT er.rate_percent
              FROM eligible_rules er
             WHERE (er.applies_to = 'all')
                OR (er.applies_to = 'product'  AND er.product_id = l.r_product_id)
                OR (er.applies_to = 'category' AND er.category IS NOT NULL AND er.category = l.r_category)
                OR (er.applies_to = 'member'   AND er.member_id IS NOT NULL AND er.member_id = l.r_member_id)
             ORDER BY er.r_spec DESC, er.priority DESC, er.created_at DESC
             LIMIT 1) AS r_rate
      FROM lines l
  )
  SELECT
    lwr.r_member_id,
    COALESCE(pr.full_name, pr.email, 'Sem comercial') AS member_name,
    COALESCE(SUM(lwr.r_base), 0)::numeric AS base_total,
    COALESCE(SUM(lwr.r_base * COALESCE(lwr.r_rate, 0) / 100.0), 0)::numeric AS commission_total,
    COUNT(DISTINCT lwr.r_order_id)::int AS num_orders
  FROM line_with_rule lwr
  LEFT JOIN public.organization_members om ON om.id = lwr.r_member_id
  LEFT JOIN public.profiles pr ON pr.id = om.user_id
  GROUP BY lwr.r_member_id, COALESCE(pr.full_name, pr.email, 'Sem comercial')
  ORDER BY commission_total DESC;
END;
$$;

-- 3) Detalhe por linha para um comercial específico (ou NULL = sem comercial)
CREATE OR REPLACE FUNCTION public.get_commission_detail(
  _org_id uuid, _member_id uuid, _from date, _to date
) RETURNS TABLE(
  line_id uuid,
  order_id uuid,
  order_number text,
  order_date date,
  product_name text,
  base numeric,
  rate_percent numeric,
  commission numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_member_id uuid;
  v_is_privileged boolean;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  v_is_privileged := public.is_org_admin(_org_id)
                  OR public.has_org_role(_org_id, 'sales_director'::app_role);

  IF NOT v_is_privileged THEN
    SELECT om.id INTO v_caller_member_id
      FROM public.organization_members om
     WHERE om.organization_id = _org_id
       AND om.user_id = auth.uid()
       AND om.status = 'active'
     LIMIT 1;
    IF v_caller_member_id IS NULL OR v_caller_member_id IS DISTINCT FROM _member_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
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
           ol.description AS r_desc,
           o.id AS r_order_id,
           o.order_number AS r_order_number,
           o.order_date AS r_order_date,
           o.assigned_member_id AS r_member_id,
           ol.product_id AS r_product_id,
           p.name AS r_product_name,
           p.category AS r_category
      FROM public.order_lines ol
      JOIN public.orders o ON o.id = ol.order_id
      LEFT JOIN public.products p ON p.id = ol.product_id
     WHERE o.organization_id = _org_id
       AND o.status IN ('paga','faturada')
       AND o.order_date BETWEEN _from AND _to
       AND (o.assigned_member_id IS NOT DISTINCT FROM _member_id)
  )
  SELECT
    l.r_line_id, l.r_order_id, l.r_order_number, l.r_order_date,
    COALESCE(l.r_product_name, l.r_desc, '—') AS product_name,
    l.r_base,
    COALESCE((SELECT er.rate_percent
       FROM eligible_rules er
      WHERE (er.applies_to = 'all')
         OR (er.applies_to = 'product'  AND er.product_id = l.r_product_id)
         OR (er.applies_to = 'category' AND er.category IS NOT NULL AND er.category = l.r_category)
         OR (er.applies_to = 'member'   AND er.member_id IS NOT NULL AND er.member_id = l.r_member_id)
      ORDER BY er.r_spec DESC, er.priority DESC, er.created_at DESC
      LIMIT 1), 0)::numeric AS rate_percent,
    (l.r_base * COALESCE((SELECT er.rate_percent
       FROM eligible_rules er
      WHERE (er.applies_to = 'all')
         OR (er.applies_to = 'product'  AND er.product_id = l.r_product_id)
         OR (er.applies_to = 'category' AND er.category IS NOT NULL AND er.category = l.r_category)
         OR (er.applies_to = 'member'   AND er.member_id IS NOT NULL AND er.member_id = l.r_member_id)
      ORDER BY er.r_spec DESC, er.priority DESC, er.created_at DESC
      LIMIT 1), 0) / 100.0)::numeric AS commission
  FROM lines l
  ORDER BY l.r_order_date DESC, l.r_order_number DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_commissions_summary(uuid,date,date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_commission_detail(uuid,uuid,date,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_commissions_summary(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_commission_detail(uuid,uuid,date,date) TO authenticated;
