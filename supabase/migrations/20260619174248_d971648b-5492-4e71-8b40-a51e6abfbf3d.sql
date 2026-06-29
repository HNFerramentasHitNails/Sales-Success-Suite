-- Customer wallets / credits
CREATE TABLE public.customer_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_wallets TO authenticated;
GRANT ALL ON public.customer_wallets TO service_role;
SELECT public.apply_tenant_rls('public.customer_wallets');
CREATE TRIGGER customer_wallets_touch BEFORE UPDATE ON public.customer_wallets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_customer_wallets_org ON public.customer_wallets(organization_id);

CREATE TABLE public.customer_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.customer_wallets(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('credito','debito','resgate','ajuste')),
  reason text,
  reference text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_wallet_transactions TO authenticated;
GRANT ALL ON public.customer_wallet_transactions TO service_role;
SELECT public.apply_tenant_rls('public.customer_wallet_transactions');
CREATE INDEX idx_cwt_wallet ON public.customer_wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX idx_cwt_org ON public.customer_wallet_transactions(organization_id);

-- adjust_wallet: atomic insert + balance update, org derived from customer
CREATE OR REPLACE FUNCTION public.adjust_wallet(
  p_customer uuid,
  p_amount numeric,
  p_type text,
  p_reason text DEFAULT NULL,
  p_reference text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_wallet_id uuid;
  v_tx_id uuid;
BEGIN
  IF p_customer IS NULL OR p_amount IS NULL OR p_type IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;
  IF p_type NOT IN ('credito','debito','resgate','ajuste') THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;

  SELECT organization_id INTO v_org FROM public.customers WHERE id = p_customer;
  IF v_org IS NULL THEN RAISE EXCEPTION 'customer_not_found'; END IF;

  IF NOT (public.is_org_member(v_org) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.customer_wallets (organization_id, customer_id)
    VALUES (v_org, p_customer)
    ON CONFLICT (customer_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_wallet_id;

  INSERT INTO public.customer_wallet_transactions
    (organization_id, wallet_id, customer_id, amount, type, reason, reference, created_by)
  VALUES
    (v_org, v_wallet_id, p_customer, p_amount, p_type, p_reason, p_reference, auth.uid())
  RETURNING id INTO v_tx_id;

  UPDATE public.customer_wallets
     SET balance = balance + p_amount,
         updated_at = now()
   WHERE id = v_wallet_id;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_wallet(uuid, numeric, text, text, text) TO authenticated;

-- VIES fields on customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS vat_country text,
  ADD COLUMN IF NOT EXISTS vies_valid boolean,
  ADD COLUMN IF NOT EXISTS vies_name text,
  ADD COLUMN IF NOT EXISTS vies_checked_at timestamptz;