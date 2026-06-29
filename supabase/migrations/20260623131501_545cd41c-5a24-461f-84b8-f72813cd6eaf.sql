
-- 1) Settings (1 per org)
CREATE TABLE IF NOT EXISTS public.lead_assignment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_assignment_settings TO authenticated;
GRANT ALL ON public.lead_assignment_settings TO service_role;
ALTER TABLE public.lead_assignment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY las_select ON public.lead_assignment_settings FOR SELECT
USING (public.is_org_member(organization_id));
CREATE POLICY las_insert ON public.lead_assignment_settings FOR INSERT
WITH CHECK (public.is_org_member(organization_id) AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)));
CREATE POLICY las_update ON public.lead_assignment_settings FOR UPDATE
USING (public.is_org_member(organization_id) AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)))
WITH CHECK (public.is_org_member(organization_id) AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)));
CREATE POLICY las_delete ON public.lead_assignment_settings FOR DELETE
USING (public.is_org_member(organization_id) AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)));

CREATE TRIGGER las_touch_updated_at BEFORE UPDATE ON public.lead_assignment_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Pool of reps
CREATE TABLE IF NOT EXISTS public.lead_assignment_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX lap_org_idx ON public.lead_assignment_pool (organization_id, is_active, sort_order, user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_assignment_pool TO authenticated;
GRANT ALL ON public.lead_assignment_pool TO service_role;
ALTER TABLE public.lead_assignment_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY lap_select ON public.lead_assignment_pool FOR SELECT
USING (public.is_org_member(organization_id));
CREATE POLICY lap_insert ON public.lead_assignment_pool FOR INSERT
WITH CHECK (public.is_org_member(organization_id) AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)));
CREATE POLICY lap_update ON public.lead_assignment_pool FOR UPDATE
USING (public.is_org_member(organization_id) AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)))
WITH CHECK (public.is_org_member(organization_id) AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)));
CREATE POLICY lap_delete ON public.lead_assignment_pool FOR DELETE
USING (public.is_org_member(organization_id) AND (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role)));

-- 3) State
CREATE TABLE IF NOT EXISTS public.lead_assignment_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_user_id uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_assignment_state TO authenticated;
GRANT ALL ON public.lead_assignment_state TO service_role;
ALTER TABLE public.lead_assignment_state ENABLE ROW LEVEL SECURITY;
-- State is managed by SECURITY DEFINER functions; only SELECT exposed
CREATE POLICY lastate_select ON public.lead_assignment_state FOR SELECT
USING (public.is_org_member(organization_id));

-- Seed settings (disabled) for existing orgs
INSERT INTO public.lead_assignment_settings (organization_id, enabled)
SELECT o.id, false FROM public.organizations o
LEFT JOIN public.lead_assignment_settings s ON s.organization_id = o.id
WHERE s.id IS NULL;

-- 4) Round-robin function
CREATE OR REPLACE FUNCTION public.assign_next_rep(_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last uuid;
  v_next uuid;
BEGIN
  SELECT last_user_id INTO v_last
    FROM public.lead_assignment_state WHERE organization_id = _org_id;

  -- pick the first active user AFTER v_last in (sort_order, user_id) order
  IF v_last IS NOT NULL THEN
    SELECT p.user_id INTO v_next
      FROM public.lead_assignment_pool p
      JOIN public.lead_assignment_pool lp ON lp.organization_id = p.organization_id AND lp.user_id = v_last
     WHERE p.organization_id = _org_id
       AND p.is_active = true
       AND (p.sort_order, p.user_id) > (lp.sort_order, lp.user_id)
     ORDER BY p.sort_order ASC, p.user_id ASC
     LIMIT 1;
  END IF;

  -- wrap-around (or no last / last not in pool anymore): start from the top
  IF v_next IS NULL THEN
    SELECT p.user_id INTO v_next
      FROM public.lead_assignment_pool p
     WHERE p.organization_id = _org_id
       AND p.is_active = true
     ORDER BY p.sort_order ASC, p.user_id ASC
     LIMIT 1;
  END IF;

  IF v_next IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.lead_assignment_state (organization_id, last_user_id, updated_at)
  VALUES (_org_id, v_next, now())
  ON CONFLICT (organization_id) DO UPDATE
    SET last_user_id = EXCLUDED.last_user_id,
        updated_at = now();

  RETURN v_next;
END;
$$;

-- 5) BEFORE INSERT trigger on prospects → set assigned_member_id from rotation
CREATE OR REPLACE FUNCTION public.prospects_auto_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_uid uuid;
  v_member_id uuid;
BEGIN
  IF NEW.assigned_member_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT enabled INTO v_enabled
    FROM public.lead_assignment_settings
   WHERE organization_id = NEW.organization_id;

  IF v_enabled IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  v_uid := public.assign_next_rep(NEW.organization_id);
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Map user_id → organization_members.id for the active membership in this org
  SELECT om.id INTO v_member_id
    FROM public.organization_members om
   WHERE om.organization_id = NEW.organization_id
     AND om.user_id = v_uid
     AND om.status = 'active'
   LIMIT 1;

  IF v_member_id IS NOT NULL THEN
    NEW.assigned_member_id := v_member_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Fire BEFORE the lead-scoring trigger? Order doesn't matter (both only set NEW fields).
DROP TRIGGER IF EXISTS prospects_auto_assign_trg ON public.prospects;
CREATE TRIGGER prospects_auto_assign_trg
BEFORE INSERT ON public.prospects
FOR EACH ROW EXECUTE FUNCTION public.prospects_auto_assign();
