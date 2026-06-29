
-- Add tags array to customers (org-scoped table; RLS already applies)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS customers_tags_gin_idx ON public.customers USING gin (tags);

-- Merge two customers (move children, delete secondary). Org-scoped + admin-only.
CREATE OR REPLACE FUNCTION public.merge_customers(_primary uuid, _secondary uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_org2 uuid;
BEGIN
  IF _primary IS NULL OR _secondary IS NULL OR _primary = _secondary THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  SELECT organization_id INTO v_org FROM public.customers WHERE id = _primary;
  SELECT organization_id INTO v_org2 FROM public.customers WHERE id = _secondary;

  IF v_org IS NULL OR v_org2 IS NULL THEN
    RAISE EXCEPTION 'customer_not_found';
  END IF;
  IF v_org <> v_org2 THEN
    RAISE EXCEPTION 'cross_org_merge_forbidden';
  END IF;
  IF NOT (public.is_org_admin(auth.uid(), v_org) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.invoices       SET customer_id = _primary WHERE customer_id = _secondary AND organization_id = v_org;
  UPDATE public.orders         SET customer_id = _primary WHERE customer_id = _secondary AND organization_id = v_org;
  UPDATE public.customer_notes SET customer_id = _primary WHERE customer_id = _secondary AND organization_id = v_org;

  -- Merge tags
  UPDATE public.customers p
     SET tags = (
       SELECT COALESCE(array_agg(DISTINCT t), '{}'::text[])
         FROM unnest(COALESCE(p.tags, '{}') || COALESCE(s.tags, '{}')) AS t
     )
    FROM public.customers s
   WHERE p.id = _primary AND s.id = _secondary;

  DELETE FROM public.customers WHERE id = _secondary AND organization_id = v_org;
END;
$$;
