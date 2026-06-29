-- =========================================================
-- F3: CRM OPERACIONAL
-- =========================================================

-- ---------- PIPELINE STAGES ----------
CREATE TABLE public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '220 50% 50%',
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pipeline_stages_org ON public.pipeline_stages(organization_id, position);
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY ps_select_same_org ON public.pipeline_stages FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY ps_insert_admin ON public.pipeline_stages FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));
CREATE POLICY ps_update_admin ON public.pipeline_stages FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));
CREATE POLICY ps_delete_admin ON public.pipeline_stages FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER trg_pipeline_stages_touch BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- PROSPECTS ----------
CREATE TABLE public.prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  assigned_to uuid,
  name text NOT NULL,
  company text,
  email text,
  phone text,
  tax_id text,
  source text,
  estimated_value numeric NOT NULL DEFAULT 0,
  probability integer NOT NULL DEFAULT 0,
  expected_close_date date,
  next_action text,
  next_action_date date,
  status text NOT NULL DEFAULT 'open', -- open | won | lost
  lost_reason text,
  notes text,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prospects_org_stage ON public.prospects(organization_id, stage_id, position);
CREATE INDEX idx_prospects_assigned ON public.prospects(assigned_to);
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospects_select_same_org ON public.prospects FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY prospects_insert_member ON public.prospects FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY prospects_update_member ON public.prospects FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY prospects_delete_admin ON public.prospects FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER trg_prospects_touch BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- CALLS ----------
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  direction text NOT NULL DEFAULT 'outbound', -- outbound | inbound
  outcome text NOT NULL DEFAULT 'completed', -- completed | no_answer | voicemail | scheduled
  duration_seconds integer NOT NULL DEFAULT 0,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calls_org_date ON public.calls(organization_id, occurred_at DESC);
CREATE INDEX idx_calls_prospect ON public.calls(prospect_id);
CREATE INDEX idx_calls_customer ON public.calls(customer_id);
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY calls_select_same_org ON public.calls FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY calls_insert_member ON public.calls FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY calls_update_member ON public.calls FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY calls_delete_admin ON public.calls FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER trg_calls_touch BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- MEETINGS ----------
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text,
  meeting_url text,
  status text NOT NULL DEFAULT 'scheduled', -- scheduled | done | canceled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meetings_org_date ON public.meetings(organization_id, starts_at);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY meetings_select_same_org ON public.meetings FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY meetings_insert_member ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY meetings_update_member ON public.meetings FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY meetings_delete_admin ON public.meetings FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER trg_meetings_touch BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- ACTIVITIES (timeline) ----------
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id uuid,
  kind text NOT NULL, -- note | email | whatsapp | system | stage_changed | call | meeting
  content text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_org_date ON public.activities(organization_id, created_at DESC);
CREATE INDEX idx_activities_prospect ON public.activities(prospect_id, created_at DESC);
CREATE INDEX idx_activities_customer ON public.activities(customer_id, created_at DESC);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY activities_select_same_org ON public.activities FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY activities_insert_member ON public.activities FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY activities_delete_admin ON public.activities FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

-- ---------- DEFAULT STAGES ON ORG CREATE ----------
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pipeline_stages (organization_id, name, position, color, is_won, is_lost) VALUES
    (NEW.id, 'Novo',        0, '220 60% 55%', false, false),
    (NEW.id, 'Qualificado', 1, '200 70% 45%', false, false),
    (NEW.id, 'Proposta',    2, '38 92% 50%',  false, false),
    (NEW.id, 'Negociação',  3, '25 95% 53%',  false, false),
    (NEW.id, 'Ganho',       4, '142 71% 45%', true,  false),
    (NEW.id, 'Perdido',     5, '0 72% 51%',   false, true);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_stages
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.seed_default_pipeline_stages();

-- Seed para organizações já existentes que não tenham stages
INSERT INTO public.pipeline_stages (organization_id, name, position, color, is_won, is_lost)
SELECT o.id, v.name, v.position, v.color, v.is_won, v.is_lost
FROM public.organizations o
CROSS JOIN (VALUES
  ('Novo',        0, '220 60% 55%', false, false),
  ('Qualificado', 1, '200 70% 45%', false, false),
  ('Proposta',    2, '38 92% 50%',  false, false),
  ('Negociação',  3, '25 95% 53%',  false, false),
  ('Ganho',       4, '142 71% 45%', true,  false),
  ('Perdido',     5, '0 72% 51%',   false, true)
) AS v(name, position, color, is_won, is_lost)
WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages ps WHERE ps.organization_id = o.id);