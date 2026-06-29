
-- OKRs module tables
CREATE TABLE public.okr_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','fechado','planeado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.okr_cycles TO authenticated;
GRANT ALL ON public.okr_cycles TO service_role;
SELECT public.apply_tenant_rls('public.okr_cycles');
CREATE TRIGGER trg_okr_cycles_touch BEFORE UPDATE ON public.okr_cycles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.okr_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.okr_cycles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  progress numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.okr_objectives TO authenticated;
GRANT ALL ON public.okr_objectives TO service_role;
SELECT public.apply_tenant_rls('public.okr_objectives');
CREATE TRIGGER trg_okr_objectives_touch BEFORE UPDATE ON public.okr_objectives
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.okr_key_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  objective_id uuid NOT NULL REFERENCES public.okr_objectives(id) ON DELETE CASCADE,
  title text NOT NULL,
  metric_type text NOT NULL DEFAULT 'percent' CHECK (metric_type IN ('number','percent','currency','boolean')),
  start_value numeric NOT NULL DEFAULT 0,
  target_value numeric NOT NULL DEFAULT 100,
  current_value numeric NOT NULL DEFAULT 0,
  unit text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.okr_key_results TO authenticated;
GRANT ALL ON public.okr_key_results TO service_role;
SELECT public.apply_tenant_rls('public.okr_key_results');
CREATE TRIGGER trg_okr_key_results_touch BEFORE UPDATE ON public.okr_key_results
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Recompute objective.progress from its KRs
CREATE OR REPLACE FUNCTION public.recompute_okr_objective_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obj uuid;
  v_avg numeric;
BEGIN
  v_obj := COALESCE(NEW.objective_id, OLD.objective_id);
  SELECT COALESCE(AVG(
    LEAST(1, GREATEST(0,
      CASE WHEN target_value = start_value THEN 0
           ELSE (current_value - start_value) / (target_value - start_value)
      END
    ))
  ), 0) INTO v_avg
  FROM public.okr_key_results WHERE objective_id = v_obj;

  UPDATE public.okr_objectives SET progress = ROUND(v_avg::numeric, 4) WHERE id = v_obj;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_okr_kr_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.okr_key_results
FOR EACH ROW EXECUTE FUNCTION public.recompute_okr_objective_progress();
