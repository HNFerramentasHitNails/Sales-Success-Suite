
-- ============== PLANS ==============
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_monthly numeric(10,2),
  currency text NOT NULL DEFAULT 'EUR',
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_select_auth" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE TRIGGER plans_touch BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== PLAN FEATURES ==============
CREATE TABLE public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  limit_int integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, feature_key)
);
GRANT SELECT ON public.plan_features TO authenticated;
GRANT ALL ON public.plan_features TO service_role;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_features_select_auth" ON public.plan_features FOR SELECT TO authenticated USING (true);

-- ============== ORGANIZATION SUBSCRIPTION ==============
CREATE TABLE public.organization_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_subscription TO authenticated;
GRANT ALL ON public.organization_subscription TO service_role;
ALTER TABLE public.organization_subscription ENABLE ROW LEVEL SECURITY;
CREATE POLICY "os_select_member" ON public.organization_subscription
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "os_insert_admin" ON public.organization_subscription
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "os_update_admin" ON public.organization_subscription
  FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY "os_delete_admin" ON public.organization_subscription
  FOR DELETE TO authenticated USING (public.is_org_admin(organization_id));
CREATE TRIGGER os_touch BEFORE UPDATE ON public.organization_subscription
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== SEED PLANS ==============
INSERT INTO public.plans (key, name, description, price_monthly, currency, sort_order) VALUES
  ('trial',      'Trial',      'Avaliação gratuita por 14 dias.', 0,    'EUR', 0),
  ('starter',    'Starter',    'Para equipas pequenas a começar.', 29,   'EUR', 1),
  ('business',   'Business',   'Para equipas em crescimento.',     99,   'EUR', 2),
  ('enterprise', 'Enterprise', 'Sob consulta — uso ilimitado.',    NULL, 'EUR', 3);

-- features per plan
WITH p AS (SELECT id, key FROM public.plans)
INSERT INTO public.plan_features (plan_id, feature_key, enabled, limit_int)
SELECT p.id, f.feature_key, f.enabled, f.limit_int
FROM p
JOIN (VALUES
  -- trial
  ('trial','max_users', true, 3),
  ('trial','max_connectors', true, 1),
  ('trial','module_commissions', true, NULL),
  ('trial','module_integrations', true, NULL),
  -- starter
  ('starter','max_users', true, 5),
  ('starter','max_connectors', true, 1),
  ('starter','module_commissions', false, NULL),
  ('starter','module_integrations', true, NULL),
  -- business
  ('business','max_users', true, 25),
  ('business','max_connectors', true, NULL),
  ('business','module_commissions', true, NULL),
  ('business','module_integrations', true, NULL),
  -- enterprise
  ('enterprise','max_users', true, NULL),
  ('enterprise','max_connectors', true, NULL),
  ('enterprise','module_commissions', true, NULL),
  ('enterprise','module_integrations', true, NULL)
) AS f(plan_key, feature_key, enabled, limit_int) ON f.plan_key = p.key;

-- assign 'business' active subscription to all existing orgs
INSERT INTO public.organization_subscription (organization_id, plan_id, status, current_period_end)
SELECT o.id, (SELECT id FROM public.plans WHERE key='business'),
       'active', now() + interval '365 days'
FROM public.organizations o
ON CONFLICT (organization_id) DO NOTHING;

-- ============== UPDATE create_organization ==============
CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_locale text DEFAULT 'pt-PT'::text, p_currency text DEFAULT 'EUR'::text, p_country text DEFAULT 'PT'::text)
 RETURNS organizations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_slug text;
  v_base text;
  v_org public.organizations;
  v_trial uuid;
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

  -- Create trial subscription (14 days)
  SELECT id INTO v_trial FROM public.plans WHERE key = 'trial' LIMIT 1;
  IF v_trial IS NOT NULL THEN
    INSERT INTO public.organization_subscription (organization_id, plan_id, status, trial_ends_at)
    VALUES (v_org.id, v_trial, 'trialing', now() + interval '14 days')
    ON CONFLICT (organization_id) DO NOTHING;
  END IF;

  RETURN v_org;
END;
$function$;

-- ============== org_feature ==============
CREATE OR REPLACE FUNCTION public.org_feature(_org_id uuid, _feature_key text)
RETURNS TABLE(enabled boolean, limit_int integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  RETURN QUERY
  SELECT COALESCE(pf.enabled, false) AS enabled,
         pf.limit_int
  FROM public.organization_subscription os
  JOIN public.plan_features pf ON pf.plan_id = os.plan_id AND pf.feature_key = _feature_key
  WHERE os.organization_id = _org_id
  LIMIT 1;
END;
$$;

-- ============== org_within_user_limit ==============
CREATE OR REPLACE FUNCTION public.org_within_user_limit(_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  SELECT pf.limit_int INTO v_limit
  FROM public.organization_subscription os
  JOIN public.plan_features pf ON pf.plan_id = os.plan_id AND pf.feature_key = 'max_users'
  WHERE os.organization_id = _org_id
  LIMIT 1;

  IF v_limit IS NULL THEN
    RETURN true; -- unlimited (or no plan resolved → permissive to not break existing flows)
  END IF;

  SELECT
    (SELECT COUNT(*) FROM public.organization_members
       WHERE organization_id = _org_id AND status = 'active')
    +
    (SELECT COUNT(*) FROM public.invitations
       WHERE organization_id = _org_id AND status = 'pending')
    INTO v_count;

  RETURN v_count < v_limit;
END;
$$;

-- ============== HARDENING: revoke from anon/public, grant only authenticated ==============
REVOKE ALL ON FUNCTION public.org_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_feature(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.org_within_user_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_within_user_limit(uuid) TO authenticated;
