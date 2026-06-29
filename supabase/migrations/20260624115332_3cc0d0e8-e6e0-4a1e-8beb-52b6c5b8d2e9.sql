-- ============================================================
-- MOTOR DE "CHAMADAS DO DIA" — FASE 1 (BD + automação)
-- Migração idempotente. Todas as funções: SECURITY DEFINER + search_path=public.
-- ============================================================

-- 1) Colunas RFM/churn nos clientes ---------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS rfm_score int,
  ADD COLUMN IF NOT EXISTS rfm_recency int,
  ADD COLUMN IF NOT EXISTS rfm_frequency int,
  ADD COLUMN IF NOT EXISTS rfm_monetary int,
  ADD COLUMN IF NOT EXISTS churn_risk text,
  ADD COLUMN IF NOT EXISTS overdue_days int,
  ADD COLUMN IF NOT EXISTS lifecycle_phase text,
  ADD COLUMN IF NOT EXISTS rfm_computed_at timestamptz;

-- 2) Colunas na sales_calls -----------------------------------
ALTER TABLE public.sales_calls
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS obtained_value numeric;

CREATE INDEX IF NOT EXISTS idx_sales_calls_org_sched_status
  ON public.sales_calls(organization_id, scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_sales_calls_org_cust_status
  ON public.sales_calls(organization_id, customer_id, status);

-- 3) compute_customer_rfm -------------------------------------
CREATE OR REPLACE FUNCTION public.compute_customer_rfm(_org uuid, _cust uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  v_days_since int;
  v_ratio numeric;
  v_r int;
  v_f int;
  v_m int;
  v_score int;
  v_overdue int;
  v_churn text;
  v_phase text;
  v_orders int;
BEGIN
  SELECT * INTO c FROM public.customers WHERE id = _cust AND organization_id = _org;
  IF NOT FOUND THEN RETURN; END IF;

  -- dias desde última compra
  IF c.last_purchase_at IS NOT NULL THEN
    v_days_since := (current_date - c.last_purchase_at);
  ELSE
    v_days_since := NULL;
  END IF;

  -- R (1-5)
  IF v_days_since IS NULL THEN
    v_r := 1;
  ELSIF COALESCE(c.avg_recurrence_days, 0) > 0 THEN
    v_ratio := v_days_since::numeric / c.avg_recurrence_days::numeric;
    v_r := CASE
      WHEN v_ratio <= 1   THEN 5
      WHEN v_ratio <= 1.5 THEN 4
      WHEN v_ratio <= 2   THEN 3
      WHEN v_ratio <= 3   THEN 2
      ELSE 1
    END;
  ELSE
    v_r := CASE
      WHEN v_days_since <= 30  THEN 5
      WHEN v_days_since <= 60  THEN 4
      WHEN v_days_since <= 120 THEN 3
      WHEN v_days_since <= 240 THEN 2
      ELSE 1
    END;
  END IF;

  -- F (1-5)
  v_orders := COALESCE(c.orders_count, 0);
  v_f := CASE
    WHEN v_orders >= 10 THEN 5
    WHEN v_orders >= 5  THEN 4
    WHEN v_orders >= 3  THEN 3
    WHEN v_orders >= 2  THEN 2
    ELSE 1
  END;

  -- M (1-5)
  v_m := CASE
    WHEN COALESCE(c.total_spent, 0) >= 5000 THEN 5
    WHEN COALESCE(c.total_spent, 0) >= 1500 THEN 4
    WHEN COALESCE(c.total_spent, 0) >= 500  THEN 3
    WHEN COALESCE(c.total_spent, 0) >= 100  THEN 2
    ELSE 1
  END;

  v_score := round(((v_r + v_f + v_m)::numeric / 15.0) * 100);

  -- overdue
  IF c.next_purchase_expected_at IS NOT NULL THEN
    v_overdue := (current_date - c.next_purchase_expected_at);
  ELSE
    v_overdue := NULL;
  END IF;

  -- churn_risk
  v_churn := CASE
    WHEN v_overdue IS NULL OR v_overdue <= 0 THEN 'baixo'
    WHEN v_overdue <= 15 THEN 'medio'
    WHEN v_overdue <= 45 THEN 'alto'
    ELSE 'critico'
  END;

  -- lifecycle_phase
  IF v_orders = 0 THEN
    v_phase := 'novo';
  ELSIF v_overdue IS NOT NULL AND v_overdue > 180 AND v_churn = 'critico' THEN
    v_phase := 'inativo';
  ELSIF v_churn IN ('alto','critico') THEN
    v_phase := 'em_risco';
  ELSIF v_orders <= 2 THEN
    v_phase := 'entrada';
  ELSE
    v_phase := 'recorrente';
  END IF;

  UPDATE public.customers
     SET rfm_recency = v_r,
         rfm_frequency = v_f,
         rfm_monetary = v_m,
         rfm_score = v_score,
         churn_risk = v_churn,
         overdue_days = v_overdue,
         lifecycle_phase = v_phase,
         rfm_computed_at = now()
   WHERE id = _cust AND organization_id = _org;
END;
$$;

-- 4) recompute_org_rfm ----------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_org_rfm(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.customers WHERE organization_id = _org AND is_active = true LOOP
    PERFORM public.recompute_customer_metrics(_org, c.id);
    PERFORM public.compute_customer_rfm(_org, c.id);
  END LOOP;
END;
$$;

-- 5) generate_daily_calls_for_org -----------------------------
CREATE OR REPLACE FUNCTION public.generate_daily_calls_for_org(_org uuid, _date date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_assigned uuid;
  v_prio text;
  v_rsn text;
  v_count int := 0;
  c RECORD;
BEGIN
  SELECT created_by INTO v_owner FROM public.organizations WHERE id = _org;

  FOR c IN
    SELECT cu.*
      FROM public.customers cu
     WHERE cu.organization_id = _org
       AND cu.is_active = true
       AND cu.churn_risk IN ('alto','critico')
       AND NOT EXISTS (
         SELECT 1 FROM public.sales_calls sc
          WHERE sc.organization_id = _org
            AND sc.customer_id = cu.id
            AND sc.status IN ('pending','rescheduled')
       )
  LOOP
    -- mapeia membro -> user_id; cai para o owner se vazio
    IF c.assigned_member_id IS NOT NULL THEN
      SELECT user_id INTO v_assigned FROM public.organization_members WHERE id = c.assigned_member_id;
    ELSE
      v_assigned := NULL;
    END IF;
    v_assigned := COALESCE(v_assigned, v_owner);

    v_prio := CASE WHEN c.churn_risk = 'critico' THEN 'urgent' ELSE 'high' END;

    v_rsn := CASE
      WHEN COALESCE(c.overdue_days, 0) > 0
        THEN '+' || c.overdue_days || ' dias além da recorrência esperada'
      ELSE 'Cliente em risco de churn'
    END;

    INSERT INTO public.sales_calls(
      organization_id, customer_id, assigned_to, scheduled_for,
      status, priority, generated, objective, reason, created_by
    ) VALUES (
      _org, c.id, v_assigned, (_date::timestamp + time '09:00'),
      'pending', v_prio, true, 'retencao', v_rsn, v_owner
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 6) Crons ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_recalculate_rfm_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.recompute_org_rfm(o.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_generate_daily_call_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.generate_daily_calls_for_org(o.id, current_date);
  END LOOP;
END;
$$;

-- Agendamento via pg_cron (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- daily-rfm-recompute @ 05:30 UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-rfm-recompute') THEN
      PERFORM cron.unschedule('daily-rfm-recompute');
    END IF;
    PERFORM cron.schedule('daily-rfm-recompute', '30 5 * * *', $cron$select public.cron_recalculate_rfm_all();$cron$);

    -- daily-call-generation @ 06:00 UTC
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-call-generation') THEN
      PERFORM cron.unschedule('daily-call-generation');
    END IF;
    PERFORM cron.schedule('daily-call-generation', '0 6 * * *', $cron$select public.cron_generate_daily_call_tasks();$cron$);
  END IF;
END;
$$;

-- 7) RPC manual "Gerar agora" ---------------------------------
CREATE OR REPLACE FUNCTION public.refresh_daily_calls(p_org uuid, p_date date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n int;
BEGIN
  IF NOT (
    public.is_org_admin(p_org)
    OR public.has_org_role(p_org, 'sales_director'::app_role)
    OR public.is_org_member(p_org)
  ) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  PERFORM public.recompute_org_rfm(p_org);
  v_n := public.generate_daily_calls_for_org(p_org, p_date);
  RETURN v_n;
END;
$$;

-- Grants ------------------------------------------------------
REVOKE ALL ON FUNCTION public.compute_customer_rfm(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_org_rfm(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_daily_calls_for_org(uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_recalculate_rfm_all() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_generate_daily_call_tasks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_daily_calls(uuid,date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.compute_customer_rfm(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_org_rfm(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_daily_calls_for_org(uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_recalculate_rfm_all() TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_generate_daily_call_tasks() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_daily_calls(uuid,date) TO authenticated, service_role;
