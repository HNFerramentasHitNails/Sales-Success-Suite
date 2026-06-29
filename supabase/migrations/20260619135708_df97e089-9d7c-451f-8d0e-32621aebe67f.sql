
CREATE TABLE public.surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','publicado','fechado')),
  is_public boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.surveys TO authenticated;
GRANT ALL ON public.surveys TO service_role;
SELECT public.apply_tenant_rls('public.surveys');
CREATE TRIGGER trg_surveys_touch BEFORE UPDATE ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_surveys_org ON public.surveys(organization_id);

CREATE TABLE public.survey_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','textarea','number','email','select','radio','checkbox','rating')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_fields TO authenticated;
GRANT ALL ON public.survey_fields TO service_role;
SELECT public.apply_tenant_rls('public.survey_fields');
CREATE INDEX idx_survey_fields_survey ON public.survey_fields(survey_id, position);

CREATE TABLE public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  respondent_email text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_responses TO authenticated;
GRANT ALL ON public.survey_responses TO service_role;
SELECT public.apply_tenant_rls('public.survey_responses');
CREATE INDEX idx_survey_responses_survey ON public.survey_responses(survey_id);

CREATE TABLE public.survey_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  response_id uuid NOT NULL REFERENCES public.survey_responses(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.survey_fields(id) ON DELETE CASCADE,
  value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_answers TO authenticated;
GRANT ALL ON public.survey_answers TO service_role;
SELECT public.apply_tenant_rls('public.survey_answers');
CREATE INDEX idx_survey_answers_response ON public.survey_answers(response_id);
