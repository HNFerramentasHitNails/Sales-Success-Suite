CREATE TABLE public.ai_knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_knowledge_entries_org_active_idx
  ON public.ai_knowledge_entries (organization_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_entries TO authenticated;
GRANT ALL ON public.ai_knowledge_entries TO service_role;

ALTER TABLE public.ai_knowledge_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read knowledge"
  ON public.ai_knowledge_entries FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "admins can insert knowledge"
  ON public.ai_knowledge_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );

CREATE POLICY "admins can update knowledge"
  ON public.ai_knowledge_entries FOR UPDATE
  TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );

CREATE POLICY "admins can delete knowledge"
  ON public.ai_knowledge_entries FOR DELETE
  TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );

CREATE TRIGGER ai_knowledge_entries_touch_updated_at
  BEFORE UPDATE ON public.ai_knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();