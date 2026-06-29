
-- 1) Extend products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'produto',
  ADD COLUMN IF NOT EXISTS cost numeric;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_product_type_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_product_type_check
      CHECK (product_type IN ('produto','kit','formacao','mercadoria'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_org_type ON public.products(organization_id, product_type);
CREATE INDEX IF NOT EXISTS idx_products_org_category ON public.products(organization_id, category);

-- 2) Kit composition table
CREATE TABLE IF NOT EXISTS public.product_kit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kit_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kit_id, component_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_kit_items TO authenticated;
GRANT ALL ON public.product_kit_items TO service_role;

SELECT public.apply_tenant_rls('public.product_kit_items');

DROP TRIGGER IF EXISTS trg_product_kit_items_updated_at ON public.product_kit_items;
CREATE TRIGGER trg_product_kit_items_updated_at
BEFORE UPDATE ON public.product_kit_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_product_kit_items_kit ON public.product_kit_items(kit_id);
CREATE INDEX IF NOT EXISTS idx_product_kit_items_component ON public.product_kit_items(component_id);

-- 3) Merge products
CREATE OR REPLACE FUNCTION public.merge_products(_primary uuid, _secondary uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org uuid;
  v_org2 uuid;
BEGIN
  IF _primary IS NULL OR _secondary IS NULL OR _primary = _secondary THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  SELECT organization_id INTO v_org  FROM public.products WHERE id = _primary;
  SELECT organization_id INTO v_org2 FROM public.products WHERE id = _secondary;

  IF v_org IS NULL OR v_org2 IS NULL THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF v_org <> v_org2 THEN RAISE EXCEPTION 'cross_org_merge_forbidden'; END IF;
  IF NOT (public.is_org_admin(auth.uid(), v_org) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.invoice_items SET product_id = _primary WHERE product_id = _secondary AND organization_id = v_org;
  UPDATE public.order_items   SET product_id = _primary WHERE product_id = _secondary AND organization_id = v_org;

  -- repoint kit components: secondary as component -> primary
  UPDATE public.product_kit_items SET component_id = _primary
    WHERE component_id = _secondary AND organization_id = v_org
      AND NOT EXISTS (
        SELECT 1 FROM public.product_kit_items x
         WHERE x.kit_id = product_kit_items.kit_id AND x.component_id = _primary
      );
  DELETE FROM public.product_kit_items WHERE component_id = _secondary AND organization_id = v_org;

  -- repoint kit_id (if secondary was itself a kit) -> primary
  UPDATE public.product_kit_items SET kit_id = _primary
    WHERE kit_id = _secondary AND organization_id = v_org
      AND NOT EXISTS (
        SELECT 1 FROM public.product_kit_items x
         WHERE x.kit_id = _primary AND x.component_id = product_kit_items.component_id
      );
  DELETE FROM public.product_kit_items WHERE kit_id = _secondary AND organization_id = v_org;

  DELETE FROM public.products WHERE id = _secondary AND organization_id = v_org;
END;
$fn$;
