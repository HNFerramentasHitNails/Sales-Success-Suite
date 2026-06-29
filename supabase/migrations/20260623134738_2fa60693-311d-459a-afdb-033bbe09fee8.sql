
-- ============ achievements ============
CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NULL,
  icon text NULL,
  metric text NOT NULL CHECK (metric IN ('total_revenue','num_orders','num_customers','num_won_deals')),
  threshold numeric NOT NULL CHECK (threshold > 0),
  period text NOT NULL DEFAULT 'all_time' CHECK (period IN ('all_time','this_month','this_year')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_achievements_org_active ON public.achievements(organization_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.achievements TO authenticated;
GRANT ALL ON public.achievements TO service_role;

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ach_select_members" ON public.achievements
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "ach_insert_admin" ON public.achievements
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));
CREATE POLICY "ach_update_admin" ON public.achievements
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role))
  WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));
CREATE POLICY "ach_delete_admin" ON public.achievements
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));

CREATE TRIGGER ach_touch_updated_at
  BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ member_achievements ============
CREATE TABLE public.member_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  value numeric NULL,
  UNIQUE (achievement_id, user_id)
);
CREATE INDEX idx_ma_org_user ON public.member_achievements(organization_id, user_id);

GRANT SELECT ON public.member_achievements TO authenticated;
GRANT ALL ON public.member_achievements TO service_role;

ALTER TABLE public.member_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ma_select_members" ON public.member_achievements
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- ============ recompute_achievements ============
CREATE OR REPLACE FUNCTION public.recompute_achievements(_org_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_from timestamptz;
  v_to timestamptz;
  v_inserted int := 0;
  v_total int := 0;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  IF NOT (public.is_org_admin(_org_id)
          OR public.has_org_role(_org_id, 'sales_director'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR r IN
    SELECT * FROM public.achievements
     WHERE organization_id = _org_id AND is_active = true
  LOOP
    IF r.period = 'this_month' THEN
      v_from := date_trunc('month', now());
      v_to := now();
    ELSIF r.period = 'this_year' THEN
      v_from := date_trunc('year', now());
      v_to := now();
    ELSE
      v_from := '1900-01-01'::timestamptz;
      v_to := '9999-12-31'::timestamptz;
    END IF;

    IF r.metric IN ('total_revenue','num_orders','num_customers') THEN
      -- Métricas baseadas em encomendas (mesma atribuição que get_team_ranking:
      -- orders.assigned_member_id → organization_members.id → profiles/user_id)
      WITH agg AS (
        SELECT om.user_id AS uid,
               CASE r.metric
                 WHEN 'total_revenue'  THEN COALESCE(SUM(o.total), 0)
                 WHEN 'num_orders'     THEN COUNT(*)::numeric
                 WHEN 'num_customers' THEN COUNT(DISTINCT o.customer_id)::numeric
               END AS val
          FROM public.orders o
          JOIN public.organization_members om ON om.id = o.assigned_member_id
         WHERE o.organization_id = _org_id
           AND o.status <> 'cancelada'
           AND o.order_date::timestamptz BETWEEN v_from AND v_to
           AND om.user_id IS NOT NULL
         GROUP BY om.user_id
      ),
      ins AS (
        INSERT INTO public.member_achievements (organization_id, user_id, achievement_id, value)
        SELECT _org_id, a.uid, r.id, a.val
          FROM agg a
         WHERE a.val >= r.threshold
        ON CONFLICT (achievement_id, user_id) DO NOTHING
        RETURNING 1
      )
      SELECT count(*) INTO v_inserted FROM ins;

    ELSIF r.metric = 'num_won_deals' THEN
      WITH agg AS (
        SELECT om.user_id AS uid, COUNT(*)::numeric AS val
          FROM public.prospects p
          JOIN public.organization_members om ON om.id = p.assigned_member_id
         WHERE p.organization_id = _org_id
           AND p.pipeline_stage = 'ganho'::pipeline_stage
           AND p.updated_at BETWEEN v_from AND v_to
           AND om.user_id IS NOT NULL
         GROUP BY om.user_id
      ),
      ins AS (
        INSERT INTO public.member_achievements (organization_id, user_id, achievement_id, value)
        SELECT _org_id, a.uid, r.id, a.val
          FROM agg a
         WHERE a.val >= r.threshold
        ON CONFLICT (achievement_id, user_id) DO NOTHING
        RETURNING 1
      )
      SELECT count(*) INTO v_inserted FROM ins;
    ELSE
      v_inserted := 0;
    END IF;

    v_total := v_total + COALESCE(v_inserted, 0);
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_achievements(uuid) TO authenticated;
