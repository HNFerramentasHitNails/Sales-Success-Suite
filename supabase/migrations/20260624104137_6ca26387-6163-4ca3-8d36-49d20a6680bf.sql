CREATE OR REPLACE FUNCTION public.org_connector_active(_org_id uuid, _connector_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_org_member(_org_id) THEN
      EXISTS (
        SELECT 1 FROM public.connections c
         WHERE c.organization_id = _org_id
           AND c.connector_key = _connector_key
           AND c.status = 'active'
      )
    ELSE false
  END;
$$;
GRANT EXECUTE ON FUNCTION public.org_connector_active(uuid, text) TO authenticated;