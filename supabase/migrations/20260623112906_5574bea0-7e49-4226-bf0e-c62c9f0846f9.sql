
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

ALTER TABLE public.organization_subscription
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_org_sub_stripe_sub ON public.organization_subscription(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_org_sub_stripe_cust ON public.organization_subscription(stripe_customer_id);

-- Platform-level setter for plan Stripe price IDs.
-- NOTE: configuração de plataforma; numa fase futura passará para super-admin.
-- Por agora protegemos exigindo que o caller seja owner/admin de PELO MENOS uma organização.
CREATE OR REPLACE FUNCTION public.set_plan_price(_plan_id uuid, _price_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.organization_members
     WHERE user_id = v_uid
       AND status = 'active'
       AND role IN ('owner','admin')
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.plans
     SET stripe_price_id = NULLIF(trim(_price_id), '')
   WHERE id = _plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_plan_price(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_plan_price(uuid, text) TO authenticated;
