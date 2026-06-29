CREATE TYPE public.pipeline_stage AS ENUM (
  'novo','contactado','qualificado','proposta','negociacao','ganho','perdido'
);

-- ========= PROSPECTS =========
CREATE TABLE public.prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  company_name text,
  email text,
  phone text,
  source text,
  pipeline_stage public.pipeline_stage NOT NULL DEFAULT 'novo',
  estimated_value numeric(14,2),
  assigned_member_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  expected_close_date date,
  won_value numeric(14,2),
  lost_reason text,
  notes_short text,
  last_interaction_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prospects_org_idx ON public.prospects(organization_id);
CREATE INDEX prospects_org_stage_idx ON public.prospects(organization_id, pipeline_stage);
CREATE INDEX prospects_assigned_idx ON public.prospects(assigned_member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospects TO authenticated;
GRANT ALL ON public.prospects TO service_role;
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospects_select" ON public.prospects
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "prospects_insert" ON public.prospects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::app_role)
    )
  );

CREATE POLICY "prospects_update" ON public.prospects
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::app_role)
    )
  )
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "prospects_delete" ON public.prospects
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE TRIGGER trg_prospects_touch BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========= PROSPECT INTERACTIONS =========
CREATE TABLE public.prospect_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  interaction_type text NOT NULL DEFAULT 'nota',
  description text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pi_org_idx ON public.prospect_interactions(organization_id);
CREATE INDEX pi_prospect_idx ON public.prospect_interactions(prospect_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_interactions TO authenticated;
GRANT ALL ON public.prospect_interactions TO service_role;
ALTER TABLE public.prospect_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pi_select" ON public.prospect_interactions
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "pi_insert" ON public.prospect_interactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::app_role)
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "pi_update" ON public.prospect_interactions
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "pi_delete" ON public.prospect_interactions
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_org_admin(organization_id));

-- Trigger: mantém prospects.last_interaction_at em sincronia
CREATE OR REPLACE FUNCTION public.bump_prospect_last_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.prospects
     SET last_interaction_at = NEW.created_at
   WHERE id = NEW.prospect_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pi_bump_last_interaction
AFTER INSERT ON public.prospect_interactions
FOR EACH ROW EXECUTE FUNCTION public.bump_prospect_last_interaction();
