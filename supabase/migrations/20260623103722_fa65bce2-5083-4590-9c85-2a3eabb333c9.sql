-- enum
DO $$ BEGIN
  CREATE TYPE public.commission_statement_status AS ENUM ('pendente','paga');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- table
CREATE TABLE public.commission_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  base_total numeric(14,2) NOT NULL DEFAULT 0,
  commission_total numeric(14,2) NOT NULL DEFAULT 0,
  status public.commission_statement_status NOT NULL DEFAULT 'pendente',
  notes text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid,
  paid_at timestamptz,
  paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_statements_period_chk CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX commission_statements_unique
  ON public.commission_statements (organization_id, member_id, period_start, period_end);
CREATE INDEX commission_statements_org_idx ON public.commission_statements (organization_id);
CREATE INDEX commission_statements_member_idx ON public.commission_statements (member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_statements TO authenticated;
GRANT ALL ON public.commission_statements TO service_role;

ALTER TABLE public.commission_statements ENABLE ROW LEVEL SECURITY;

-- SELECT: admins/owners/sales_director veem todos; outros só os seus
CREATE POLICY "commission_statements_select"
ON public.commission_statements FOR SELECT
TO authenticated
USING (
  public.is_org_member(organization_id) AND (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
       WHERE om.id = commission_statements.member_id
         AND om.user_id = auth.uid()
         AND om.organization_id = commission_statements.organization_id
         AND om.status = 'active'
    )
  )
);

CREATE POLICY "commission_statements_insert"
ON public.commission_statements FOR INSERT
TO authenticated
WITH CHECK (
  public.is_org_admin(organization_id)
  OR public.has_org_role(organization_id, 'sales_director'::app_role)
);

CREATE POLICY "commission_statements_update"
ON public.commission_statements FOR UPDATE
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR public.has_org_role(organization_id, 'sales_director'::app_role)
)
WITH CHECK (
  public.is_org_admin(organization_id)
  OR public.has_org_role(organization_id, 'sales_director'::app_role)
);

CREATE POLICY "commission_statements_delete"
ON public.commission_statements FOR DELETE
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR public.has_org_role(organization_id, 'sales_director'::app_role)
);

CREATE TRIGGER commission_statements_touch
BEFORE UPDATE ON public.commission_statements
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- generate function
CREATE OR REPLACE FUNCTION public.generate_commission_statements(
  _org_id uuid, _from date, _to date
)
RETURNS TABLE(
  id uuid,
  member_id uuid,
  member_name text,
  base_total numeric,
  commission_total numeric,
  status public.commission_statement_status,
  generated_at timestamptz,
  paid_at timestamptz,
  was_skipped boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Compute per-member commissions for the period using the same rule logic
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
  agg AS (
    SELECT r_member_id,
           SUM(r_base)::numeric(14,2) AS base_total,
           SUM(r_base * COALESCE(r_rate,0) / 100.0)::numeric(14,2) AS commission_total
      FROM line_with_rule
     GROUP BY r_member_id
     HAVING SUM(r_base * COALESCE(r_rate,0) / 100.0) > 0
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
  -- return all statements of this period (including ones we just upserted)
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
$$;

REVOKE EXECUTE ON FUNCTION public.generate_commission_statements(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_commission_statements(uuid, date, date) TO authenticated;

-- mark as paid
CREATE OR REPLACE FUNCTION public.mark_commission_statement_paid(_statement_id uuid)
RETURNS public.commission_statements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.commission_statements;
BEGIN
  SELECT * INTO v_row FROM public.commission_statements WHERE id = _statement_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF NOT (public.is_org_admin(v_row.organization_id)
          OR public.has_org_role(v_row.organization_id, 'sales_director'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_row.status = 'paga' THEN
    RETURN v_row;
  END IF;
  UPDATE public.commission_statements
     SET status = 'paga', paid_at = now(), paid_by = auth.uid()
   WHERE id = _statement_id
   RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_commission_statement_paid(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_commission_statement_paid(uuid) TO authenticated;
