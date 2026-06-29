
-- =========== ISSUES ===========
CREATE TABLE IF NOT EXISTS public.issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  assigned_to uuid NULL,
  created_by uuid NULL DEFAULT auth.uid(),
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issues_org_status ON public.issues(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_org_assigned ON public.issues(organization_id, assigned_to);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.issues TO authenticated;
GRANT ALL ON public.issues TO service_role;

ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY issues_select ON public.issues
  FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY issues_insert ON public.issues
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id) AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::app_role)
    )
  );

CREATE POLICY issues_update ON public.issues
  FOR UPDATE USING (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
    OR (
      public.has_org_role(organization_id, 'sales_rep'::app_role)
      AND (assigned_to = auth.uid() OR created_by = auth.uid())
    )
  ) WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY issues_delete ON public.issues
  FOR DELETE USING (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
    OR (
      public.has_org_role(organization_id, 'sales_rep'::app_role)
      AND created_by = auth.uid()
    )
  );

CREATE TRIGGER trg_issues_updated_at
  BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========== RMA ===========
CREATE TABLE IF NOT EXISTS public.rma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  reason text NULL,
  notes text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','received','inspecting','approved','rejected','refunded','closed')),
  resolution text NULL CHECK (resolution IN ('refund','replace','credit','none')),
  assigned_to uuid NULL,
  created_by uuid NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rma_org_status ON public.rma(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_rma_org_assigned ON public.rma(organization_id, assigned_to);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rma TO authenticated;
GRANT ALL ON public.rma TO service_role;

ALTER TABLE public.rma ENABLE ROW LEVEL SECURITY;

CREATE POLICY rma_select ON public.rma
  FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY rma_insert ON public.rma
  FOR INSERT WITH CHECK (
    public.is_org_member(organization_id) AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::app_role)
    )
  );

CREATE POLICY rma_update ON public.rma
  FOR UPDATE USING (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
    OR (
      public.has_org_role(organization_id, 'sales_rep'::app_role)
      AND (assigned_to = auth.uid() OR created_by = auth.uid())
    )
  ) WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY rma_delete ON public.rma
  FOR DELETE USING (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
    OR (
      public.has_org_role(organization_id, 'sales_rep'::app_role)
      AND created_by = auth.uid()
    )
  );

CREATE TRIGGER trg_rma_updated_at
  BEFORE UPDATE ON public.rma
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
