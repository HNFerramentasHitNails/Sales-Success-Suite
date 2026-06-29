CREATE OR REPLACE FUNCTION public.bulk_customer_tags(p_ids uuid[], p_add text[], p_remove text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; n int;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RETURN 0; END IF;
  IF (SELECT count(DISTINCT organization_id) FROM public.customers WHERE id = ANY(p_ids)) <> 1 THEN
    RAISE EXCEPTION 'Clientes de organizações diferentes ou inexistentes';
  END IF;
  SELECT DISTINCT organization_id INTO v_org FROM public.customers WHERE id = ANY(p_ids);
  IF NOT public.is_org_member(v_org) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  UPDATE public.customers c
     SET tags = sub.newtags, updated_at = now()
  FROM (
    SELECT x.id,
      COALESCE((
        SELECT array_agg(DISTINCT t ORDER BY t)
        FROM unnest(COALESCE(x.tags, ARRAY[]::text[]) || COALESCE(p_add, ARRAY[]::text[])) AS t
        WHERE t <> ALL (COALESCE(p_remove, ARRAY[]::text[]))
      ), ARRAY[]::text[]) AS newtags
    FROM public.customers x
    WHERE x.id = ANY(p_ids) AND x.organization_id = v_org
  ) sub
  WHERE c.id = sub.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.bulk_customer_tags(uuid[],text[],text[]) TO authenticated;