CREATE TABLE public.organization_brands (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_brands TO authenticated;
GRANT ALL ON public.organization_brands TO service_role;

ALTER TABLE public.organization_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brands_select" ON public.organization_brands
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "brands_insert" ON public.organization_brands
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "brands_update" ON public.organization_brands
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "brands_delete" ON public.organization_brands
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER update_organization_brands_updated_at
  BEFORE UPDATE ON public.organization_brands
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_org_brands_org ON public.organization_brands(organization_id, position);

ALTER TABLE public.meetings
  ADD COLUMN brand_id uuid NULL REFERENCES public.organization_brands(id) ON DELETE SET NULL;
