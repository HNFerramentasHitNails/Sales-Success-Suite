
-- 1) Hierarquia
ALTER TABLE public.customer_tag_definitions
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL
    REFERENCES public.customer_tag_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ctd_parent ON public.customer_tag_definitions(parent_id);

-- 2) Regras de upgrade
CREATE TABLE IF NOT EXISTS public.customer_tag_upgrade_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_tag_id uuid NOT NULL REFERENCES public.customer_tag_definitions(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('total_revenue','num_orders','total_quantity')),
  period text NOT NULL DEFAULT 'all_time' CHECK (period IN ('all_time','last_12_months','this_year')),
  operator text NOT NULL DEFAULT '>=' CHECK (operator IN ('>=','>','=','<','<=')),
  threshold numeric NOT NULL,
  remove_tag_id uuid NULL REFERENCES public.customer_tag_definitions(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_tag_upgrade_rules TO authenticated;
GRANT ALL ON public.customer_tag_upgrade_rules TO service_role;

ALTER TABLE public.customer_tag_upgrade_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY ctur_select ON public.customer_tag_upgrade_rules
  FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY ctur_insert ON public.customer_tag_upgrade_rules
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id)
    AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role))
  );

CREATE POLICY ctur_update ON public.customer_tag_upgrade_rules
  FOR UPDATE USING (
    public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)
  ) WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY ctur_delete ON public.customer_tag_upgrade_rules
  FOR DELETE USING (
    public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );

CREATE TRIGGER trg_ctur_updated_at
  BEFORE UPDATE ON public.customer_tag_upgrade_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Função
CREATE OR REPLACE FUNCTION public.apply_tag_upgrade_rules(_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rule RECORD;
  v_from date;
  v_to date;
  v_op text;
  v_target_name text;
  v_remove_name text;
  v_count int := 0;
  v_total int := 0;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  IF NOT (public.is_org_admin(_org_id)
          OR public.has_org_role(_org_id, 'sales_director'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_rule IN
    SELECT * FROM public.customer_tag_upgrade_rules
     WHERE organization_id = _org_id AND is_active = true
  LOOP
    -- Resolve período
    IF v_rule.period = 'all_time' THEN
      v_from := '1900-01-01'::date;
      v_to := '9999-12-31'::date;
    ELSIF v_rule.period = 'last_12_months' THEN
      v_from := (now() - interval '12 months')::date;
      v_to := now()::date;
    ELSIF v_rule.period = 'this_year' THEN
      v_from := date_trunc('year', now())::date;
      v_to := now()::date;
    END IF;

    -- Resolve nomes das tags (o modelo guarda nomes em customers.tags[])
    SELECT name INTO v_target_name FROM public.customer_tag_definitions
      WHERE id = v_rule.target_tag_id AND organization_id = _org_id;
    IF v_target_name IS NULL THEN CONTINUE; END IF;

    v_remove_name := NULL;
    IF v_rule.remove_tag_id IS NOT NULL THEN
      SELECT name INTO v_remove_name FROM public.customer_tag_definitions
        WHERE id = v_rule.remove_tag_id AND organization_id = _org_id;
    END IF;

    v_op := v_rule.operator;

    -- Atribuir target_tag aos clientes que cumprem
    WITH metric_per_customer AS (
      SELECT o.customer_id AS cid,
             CASE v_rule.metric
               WHEN 'total_revenue'  THEN COALESCE(SUM(o.total), 0)
               WHEN 'num_orders'     THEN COUNT(*)::numeric
               WHEN 'total_quantity' THEN COALESCE(SUM(ol.quantity), 0)
             END AS val
        FROM public.orders o
        LEFT JOIN public.order_lines ol ON ol.order_id = o.id
       WHERE o.organization_id = _org_id
         AND o.status <> 'cancelada'
         AND o.order_date BETWEEN v_from AND v_to
         AND o.customer_id IS NOT NULL
       GROUP BY o.customer_id
    ),
    matched AS (
      SELECT c.id, c.tags
        FROM public.customers c
        JOIN metric_per_customer m ON m.cid = c.id
       WHERE c.organization_id = _org_id
         AND (
              (v_op = '>=' AND m.val >= v_rule.threshold) OR
              (v_op = '>'  AND m.val >  v_rule.threshold) OR
              (v_op = '='  AND m.val =  v_rule.threshold) OR
              (v_op = '<'  AND m.val <  v_rule.threshold) OR
              (v_op = '<=' AND m.val <= v_rule.threshold)
             )
    ),
    upd AS (
      UPDATE public.customers c
         SET tags = (
               SELECT ARRAY(SELECT DISTINCT t
                              FROM unnest(
                                CASE WHEN v_remove_name IS NULL
                                     THEN array_append(c.tags, v_target_name)
                                     ELSE array_append(
                                            array_remove(c.tags, v_remove_name),
                                            v_target_name)
                                END
                              ) AS t)
             ),
             updated_at = now()
        FROM matched m
       WHERE c.id = m.id
         AND (
               NOT (v_target_name = ANY (c.tags))
               OR (v_remove_name IS NOT NULL AND v_remove_name = ANY (c.tags))
             )
      RETURNING c.id
    )
    SELECT count(*) INTO v_count FROM upd;

    v_total := v_total + COALESCE(v_count, 0);
  END LOOP;

  RETURN v_total;
END;
$fn$;
