
-- Helper: can this org still add a member (active members + pending invitations vs plan.max_users)?
CREATE OR REPLACE FUNCTION public.org_can_add_member(p_org uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_key text;
  v_max integer;
  v_count integer;
BEGIN
  IF public.is_platform_admin(auth.uid()) THEN
    RETURN true;
  END IF;

  SELECT COALESCE(s.plan, o.plan, 'free')
    INTO v_plan_key
    FROM public.organizations o
    LEFT JOIN public.subscriptions s ON s.organization_id = o.id
   WHERE o.id = p_org;

  SELECT max_users INTO v_max FROM public.plans WHERE key = COALESCE(v_plan_key, 'free');
  IF v_max IS NULL THEN
    RETURN true; -- ilimitado
  END IF;

  SELECT
    (SELECT count(*) FROM public.organization_members m
       WHERE m.organization_id = p_org AND m.is_active = true)
    +
    (SELECT count(*) FROM public.invitations i
       WHERE i.organization_id = p_org AND i.accepted_at IS NULL AND i.expires_at > now())
    INTO v_count;

  RETURN v_count < v_max;
END;
$$;

-- Helper: can this org still add a customer (vs plan.max_customers)?
CREATE OR REPLACE FUNCTION public.org_can_add_customer(p_org uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_key text;
  v_max integer;
  v_count integer;
BEGIN
  IF public.is_platform_admin(auth.uid()) THEN
    RETURN true;
  END IF;

  SELECT COALESCE(s.plan, o.plan, 'free')
    INTO v_plan_key
    FROM public.organizations o
    LEFT JOIN public.subscriptions s ON s.organization_id = o.id
   WHERE o.id = p_org;

  SELECT max_customers INTO v_max FROM public.plans WHERE key = COALESCE(v_plan_key, 'free');
  IF v_max IS NULL THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.customers c
   WHERE c.organization_id = p_org;

  RETURN v_count < v_max;
END;
$$;

-- BEFORE INSERT trigger on customers enforcing the limit
CREATE OR REPLACE FUNCTION public.enforce_customer_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role bypass (webhooks/admin code)
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    -- background / no auth context: allow
    RETURN NEW;
  END IF;

  IF NOT public.org_can_add_customer(NEW.organization_id) THEN
    RAISE EXCEPTION 'plan_limit_customers' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_plan_limit ON public.customers;
CREATE TRIGGER trg_customers_plan_limit
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_plan_limit();
