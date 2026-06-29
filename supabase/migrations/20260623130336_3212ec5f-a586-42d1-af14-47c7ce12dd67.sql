
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'meeting',
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  prospect_id uuid NULL REFERENCES public.prospects(id) ON DELETE SET NULL,
  assigned_to uuid NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NULL,
  all_day boolean NOT NULL DEFAULT false,
  location text NULL,
  notes text NULL,
  status text NOT NULL DEFAULT 'scheduled',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activities_type_chk CHECK (type IN ('meeting','call','task','followup','other')),
  CONSTRAINT activities_status_chk CHECK (status IN ('scheduled','done','canceled'))
);

CREATE INDEX activities_org_start_idx ON public.activities (organization_id, start_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY act_select ON public.activities FOR SELECT
USING (public.is_org_member(organization_id));

CREATE POLICY act_insert ON public.activities FOR INSERT
WITH CHECK (
  public.is_org_member(organization_id)
  AND (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
    OR public.has_org_role(organization_id, 'sales_rep'::app_role)
  )
  AND created_by = auth.uid()
);

CREATE POLICY act_update ON public.activities FOR UPDATE
USING (
  public.is_org_member(organization_id)
  AND (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
)
WITH CHECK (
  public.is_org_member(organization_id)
  AND (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
  )
);

CREATE POLICY act_delete ON public.activities FOR DELETE
USING (
  public.is_org_member(organization_id)
  AND (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
    OR created_by = auth.uid()
  )
);

CREATE TRIGGER activities_touch_updated_at
BEFORE UPDATE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
