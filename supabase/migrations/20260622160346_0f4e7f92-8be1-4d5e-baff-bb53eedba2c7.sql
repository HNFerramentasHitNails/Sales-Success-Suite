
-- 1) Extend customer_wallet_transactions with new columns (additive, keep old ones for adjust_wallet compatibility)
ALTER TABLE public.customer_wallet_transactions
  ADD COLUMN IF NOT EXISTS transaction_type text,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS balance_after numeric,
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.customer_wallet_transactions
  DROP CONSTRAINT IF EXISTS customer_wallet_transactions_transaction_type_check;
ALTER TABLE public.customer_wallet_transactions
  ADD CONSTRAINT customer_wallet_transactions_transaction_type_check
  CHECK (transaction_type IS NULL OR transaction_type IN ('credit','debit'));

ALTER TABLE public.customer_wallet_transactions
  DROP CONSTRAINT IF EXISTS customer_wallet_transactions_amount_positive;
ALTER TABLE public.customer_wallet_transactions
  ADD CONSTRAINT customer_wallet_transactions_amount_positive CHECK (amount > 0);

-- 2) Unique (org, customer) on wallets (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_wallets_org_customer
  ON public.customer_wallets (organization_id, customer_id);

-- 3) Idempotency: unique partial index on (wallet_id, source_type, source_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_source
  ON public.customer_wallet_transactions (wallet_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

-- 4) Restrict direct writes from clients — only SELECT remains for members.
--    All writes go through SECURITY DEFINER RPCs (wallet_credit / wallet_debit / adjust_wallet).
DROP POLICY IF EXISTS tenant_insert ON public.customer_wallets;
DROP POLICY IF EXISTS tenant_update ON public.customer_wallets;
DROP POLICY IF EXISTS tenant_delete ON public.customer_wallets;
DROP POLICY IF EXISTS tenant_insert ON public.customer_wallet_transactions;
DROP POLICY IF EXISTS tenant_update ON public.customer_wallet_transactions;
DROP POLICY IF EXISTS tenant_delete ON public.customer_wallet_transactions;
-- tenant_select stays in place (already created by apply_tenant_rls)

-- Ensure grants (service_role for the SECURITY DEFINER functions; authenticated for SELECT through RLS)
GRANT SELECT ON public.customer_wallets TO authenticated;
GRANT SELECT ON public.customer_wallet_transactions TO authenticated;
GRANT ALL ON public.customer_wallets TO service_role;
GRANT ALL ON public.customer_wallet_transactions TO service_role;

-- 5) wallet_credit RPC
CREATE OR REPLACE FUNCTION public.wallet_credit(
  p_customer_id uuid,
  p_amount numeric,
  p_source_type text DEFAULT 'manual',
  p_source_id text DEFAULT NULL,
  p_description text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_wallet_id uuid;
  v_balance numeric;
  v_new_balance numeric;
  v_existing_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT organization_id INTO v_org FROM public.customers WHERE id = p_customer_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'customer_not_found'; END IF;

  IF NOT (public.is_org_member(v_org) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.customer_wallets (organization_id, customer_id)
    VALUES (v_org, p_customer_id)
    ON CONFLICT (organization_id, customer_id) DO UPDATE SET updated_at = customer_wallets.updated_at
    RETURNING id INTO v_wallet_id;

  -- Lock the wallet row
  SELECT balance INTO v_balance FROM public.customer_wallets WHERE id = v_wallet_id FOR UPDATE;

  -- Idempotency
  IF p_source_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM public.customer_wallet_transactions
     WHERE wallet_id = v_wallet_id
       AND source_type = COALESCE(p_source_type, 'manual')
       AND source_id = p_source_id
     LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'balance', v_balance, 'wallet_id', v_wallet_id, 'idempotent', true);
    END IF;
  END IF;

  v_new_balance := v_balance + p_amount;

  UPDATE public.customer_wallets
     SET balance = v_new_balance, updated_at = now()
   WHERE id = v_wallet_id;

  INSERT INTO public.customer_wallet_transactions
    (organization_id, wallet_id, customer_id, amount, type, transaction_type,
     source_type, source_id, balance_after, description, reason, created_by)
  VALUES
    (v_org, v_wallet_id, p_customer_id, p_amount, 'credito', 'credit',
     COALESCE(p_source_type, 'manual'), p_source_id, v_new_balance, p_description, p_description, auth.uid());

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance, 'wallet_id', v_wallet_id, 'idempotent', false);
END;
$$;

-- 6) wallet_debit RPC
CREATE OR REPLACE FUNCTION public.wallet_debit(
  p_customer_id uuid,
  p_amount numeric,
  p_source_type text DEFAULT 'manual',
  p_source_id text DEFAULT NULL,
  p_description text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_wallet_id uuid;
  v_balance numeric;
  v_new_balance numeric;
  v_existing_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT organization_id INTO v_org FROM public.customers WHERE id = p_customer_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'customer_not_found'; END IF;

  IF NOT (public.is_org_member(v_org) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.customer_wallets (organization_id, customer_id)
    VALUES (v_org, p_customer_id)
    ON CONFLICT (organization_id, customer_id) DO UPDATE SET updated_at = customer_wallets.updated_at
    RETURNING id INTO v_wallet_id;

  SELECT balance INTO v_balance FROM public.customer_wallets WHERE id = v_wallet_id FOR UPDATE;

  IF p_source_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
      FROM public.customer_wallet_transactions
     WHERE wallet_id = v_wallet_id
       AND source_type = COALESCE(p_source_type, 'manual')
       AND source_id = p_source_id
     LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'balance', v_balance, 'wallet_id', v_wallet_id, 'idempotent', true);
    END IF;
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  v_new_balance := v_balance - p_amount;

  UPDATE public.customer_wallets
     SET balance = v_new_balance, updated_at = now()
   WHERE id = v_wallet_id;

  INSERT INTO public.customer_wallet_transactions
    (organization_id, wallet_id, customer_id, amount, type, transaction_type,
     source_type, source_id, balance_after, description, reason, created_by)
  VALUES
    (v_org, v_wallet_id, p_customer_id, p_amount, 'debito', 'debit',
     COALESCE(p_source_type, 'manual'), p_source_id, v_new_balance, p_description, p_description, auth.uid());

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance, 'wallet_id', v_wallet_id, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_credit(uuid, numeric, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_debit(uuid, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_credit(uuid, numeric, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wallet_debit(uuid, numeric, text, text, text) TO authenticated, service_role;

-- 7) Update seed of default organization modules to include 'wallet'
CREATE OR REPLACE FUNCTION public.seed_default_organization_modules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_modules (organization_id, module_id, enabled)
  VALUES
    (NEW.id, 'sales', true),
    (NEW.id, 'ai_agents', true),
    (NEW.id, 'distribution', true),
    (NEW.id, 'wallet', true),
    (NEW.id, 'moloni', true),
    (NEW.id, 'shopify', true),
    (NEW.id, 'google_calendar', true),
    (NEW.id, 'stripe', true)
  ON CONFLICT (organization_id, module_id) DO NOTHING;
  RETURN NEW;
END $$;

-- 8) Backfill 'wallet' module for existing organizations
INSERT INTO public.organization_modules (organization_id, module_id, enabled)
SELECT id, 'wallet', true FROM public.organizations
ON CONFLICT (organization_id, module_id) DO NOTHING;
