
-- Sales calls (telesales) management
CREATE TABLE IF NOT EXISTS public.sales_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  prospect_id uuid NULL REFERENCES public.prospects(id) ON DELETE SET NULL,
  assigned_to uuid NULL,
  scheduled_for timestamptz NULL,
  status text NOT NULL DEFAULT 'pending',
  outcome text NULL,
  notes text NULL,
  duration_minutes int NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_calls_status_chk CHECK (status IN ('pending','completed','no_answer','rescheduled','canceled')),
  CONSTRAINT sales_calls_target_chk CHECK (customer_id IS NOT NULL OR prospect_id IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_calls TO authenticated;
GRANT ALL ON public.sales_calls TO service_role;

ALTER TABLE public.sales_calls ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS sales_calls_org_sched_idx ON public.sales_calls (organization_id, scheduled_for);
CREATE INDEX IF NOT EXISTS sales_calls_org_assigned_status_idx ON public.sales_calls (organization_id, assigned_to, status);

DROP POLICY IF EXISTS sc_select ON public.sales_calls;
CREATE POLICY sc_select ON public.sales_calls
  FOR SELECT USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS sc_insert ON public.sales_calls;
CREATE POLICY sc_insert ON public.sales_calls
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::app_role)
    )
    AND (created_by = auth.uid())
  );

DROP POLICY IF EXISTS sc_update ON public.sales_calls;
CREATE POLICY sc_update ON public.sales_calls
  FOR UPDATE USING (
    public.is_org_member(organization_id)
    AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR assigned_to = auth.uid()
      OR created_by = auth.uid()
    )
  ) WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS sc_delete ON public.sales_calls;
CREATE POLICY sc_delete ON public.sales_calls
  FOR DELETE USING (
    public.is_org_admin(organization_id) OR created_by = auth.uid()
  );

DROP TRIGGER IF EXISTS sales_calls_touch_updated_at ON public.sales_calls;
CREATE TRIGGER sales_calls_touch_updated_at
  BEFORE UPDATE ON public.sales_calls
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
