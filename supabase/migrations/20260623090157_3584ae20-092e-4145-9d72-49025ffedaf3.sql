CREATE OR REPLACE FUNCTION public.create_organization(
  p_name text,
  p_locale text DEFAULT 'pt-PT',
  p_currency text DEFAULT 'EUR',
  p_country text DEFAULT 'PT'
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slug text;
  v_base text;
  v_org public.organizations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  v_base := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  IF v_base = '' THEN v_base := 'org'; END IF;
  v_slug := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);

  INSERT INTO public.organizations (name, slug, locale, currency, country, created_by)
  VALUES (trim(p_name), v_slug, p_locale, p_currency, p_country, v_uid)
  RETURNING * INTO v_org;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_org.id, v_uid, 'owner'::app_role, 'active'::member_status);

  RETURN v_org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization(text, text, text, text) TO authenticated;
