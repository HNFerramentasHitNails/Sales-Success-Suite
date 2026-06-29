
-- 1) Column on prospects
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS lead_score int NOT NULL DEFAULT 0;

-- 2) Config table
CREATE TABLE IF NOT EXISTS public.lead_scoring_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  weights jsonb NOT NULL DEFAULT '{
    "stage_points": {"novo":5,"contactado":15,"qualificado":30,"proposta":50,"negociacao":65,"ganho":100,"perdido":0},
    "value_tiers": [{"min":10000,"points":25},{"min":1000,"points":10}],
    "has_email": 5,
    "has_phone": 5,
    "recent_activity_days": 14,
    "recent_activity_points": 15
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_scoring_config TO authenticated;
GRANT ALL ON public.lead_scoring_config TO service_role;

ALTER TABLE public.lead_scoring_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY lsc_select ON public.lead_scoring_config FOR SELECT
USING (public.is_org_member(organization_id));

CREATE POLICY lsc_insert ON public.lead_scoring_config FOR INSERT
WITH CHECK (
  public.is_org_member(organization_id)
  AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role))
);

CREATE POLICY lsc_update ON public.lead_scoring_config FOR UPDATE
USING (
  public.is_org_member(organization_id)
  AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role))
)
WITH CHECK (
  public.is_org_member(organization_id)
  AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role))
);

CREATE TRIGGER lsc_touch_updated_at
BEFORE UPDATE ON public.lead_scoring_config
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed a default config row for every existing org
INSERT INTO public.lead_scoring_config (organization_id)
SELECT o.id FROM public.organizations o
LEFT JOIN public.lead_scoring_config c ON c.organization_id = o.id
WHERE c.id IS NULL;

-- 3) Compute function (called by BEFORE trigger; runs as SECURITY DEFINER to bypass RLS on activities/sales_calls read)
CREATE OR REPLACE FUNCTION public.compute_prospect_score(
  _org_id uuid,
  _prospect_id uuid,
  _stage public.pipeline_stage,
  _estimated_value numeric,
  _email text,
  _phone text
) RETURNS int
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weights jsonb;
  v_active boolean;
  v_score int := 0;
  v_stage_pts int;
  v_tier jsonb;
  v_recent_days int;
  v_recent_pts int;
  v_has_recent boolean;
BEGIN
  SELECT weights, is_active INTO v_weights, v_active
    FROM public.lead_scoring_config WHERE organization_id = _org_id;

  IF v_weights IS NULL THEN
    -- fallback defaults
    v_weights := '{
      "stage_points": {"novo":5,"contactado":15,"qualificado":30,"proposta":50,"negociacao":65,"ganho":100,"perdido":0},
      "value_tiers": [{"min":10000,"points":25},{"min":1000,"points":10}],
      "has_email": 5, "has_phone": 5,
      "recent_activity_days": 14, "recent_activity_points": 15
    }'::jsonb;
    v_active := true;
  END IF;

  IF v_active IS DISTINCT FROM true THEN
    RETURN 0;
  END IF;

  -- Stage
  v_stage_pts := COALESCE((v_weights->'stage_points'->>(_stage::text))::int, 0);
  v_score := v_score + v_stage_pts;

  -- Value tiers: pick first matching (tiers should be ordered desc by min in config)
  IF _estimated_value IS NOT NULL THEN
    FOR v_tier IN SELECT * FROM jsonb_array_elements(COALESCE(v_weights->'value_tiers','[]'::jsonb))
    LOOP
      IF _estimated_value >= COALESCE((v_tier->>'min')::numeric, 0) THEN
        v_score := v_score + COALESCE((v_tier->>'points')::int, 0);
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- Email / Phone
  IF _email IS NOT NULL AND length(trim(_email)) > 0 THEN
    v_score := v_score + COALESCE((v_weights->>'has_email')::int, 0);
  END IF;
  IF _phone IS NOT NULL AND length(trim(_phone)) > 0 THEN
    v_score := v_score + COALESCE((v_weights->>'has_phone')::int, 0);
  END IF;

  -- Recent activity (activities OR sales_calls completed within N days)
  v_recent_days := COALESCE((v_weights->>'recent_activity_days')::int, 14);
  v_recent_pts := COALESCE((v_weights->>'recent_activity_points')::int, 0);

  IF _prospect_id IS NOT NULL AND v_recent_pts > 0 AND v_recent_days > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.activities
       WHERE prospect_id = _prospect_id
         AND start_at >= now() - (v_recent_days || ' days')::interval
      UNION ALL
      SELECT 1 FROM public.sales_calls
       WHERE prospect_id = _prospect_id
         AND scheduled_for >= now() - (v_recent_days || ' days')::interval
    ) INTO v_has_recent;
    IF v_has_recent THEN
      v_score := v_score + v_recent_pts;
    END IF;
  END IF;

  IF v_score < 0 THEN v_score := 0; END IF;
  IF v_score > 100 THEN v_score := 100; END IF;
  RETURN v_score;
END;
$$;

-- 4) BEFORE trigger on prospects: assigns NEW.lead_score in place (no recursion)
CREATE OR REPLACE FUNCTION public.prospects_assign_lead_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.lead_score := public.compute_prospect_score(
    NEW.organization_id, NEW.id, NEW.pipeline_stage,
    NEW.estimated_value, NEW.email, NEW.phone
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prospects_set_lead_score ON public.prospects;
CREATE TRIGGER prospects_set_lead_score
BEFORE INSERT OR UPDATE ON public.prospects
FOR EACH ROW EXECUTE FUNCTION public.prospects_assign_lead_score();

-- 5) Recompute helper (admin / sales_director)
CREATE OR REPLACE FUNCTION public.recompute_org_lead_scores(_org_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  IF NOT (public.is_org_admin(_org_id) OR public.has_org_role(_org_id, 'sales_director'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Touching updated_at fires BEFORE trigger which recomputes lead_score
  UPDATE public.prospects SET updated_at = now() WHERE organization_id = _org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 6) Backfill scores for existing prospects
UPDATE public.prospects SET updated_at = now();
