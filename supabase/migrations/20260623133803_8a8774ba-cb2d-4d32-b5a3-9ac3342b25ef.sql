
-- ============ customer_wallets ============
CREATE TABLE public.customer_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  currency text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, customer_id)
);
CREATE INDEX idx_customer_wallets_org ON public.customer_wallets(organization_id);

GRANT SELECT ON public.customer_wallets TO authenticated;
GRANT ALL ON public.customer_wallets TO service_role;

ALTER TABLE public.customer_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallets_select_members" ON public.customer_wallets
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- ============ customer_wallet_transactions ============
CREATE TABLE public.customer_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.customer_wallets(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('credit','debit')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual','adjustment','order','refund','voucher','topup','other')),
  source_id uuid NULL,
  description text NULL,
  balance_after numeric(14,2) NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cwt_org_customer ON public.customer_wallet_transactions(organization_id, customer_id, created_at DESC);
CREATE INDEX idx_cwt_wallet ON public.customer_wallet_transactions(wallet_id, created_at DESC);
-- Idempotência: mesmo source_type + source_id nunca lançado duas vezes
CREATE UNIQUE INDEX uniq_cwt_source ON public.customer_wallet_transactions(source_type, source_id)
  WHERE source_id IS NOT NULL;

GRANT SELECT ON public.customer_wallet_transactions TO authenticated;
GRANT ALL ON public.customer_wallet_transactions TO service_role;

ALTER TABLE public.customer_wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cwt_select_members" ON public.customer_wallet_transactions
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- ============ Função: wallet_credit ============
CREATE OR REPLACE FUNCTION public.wallet_credit(
  _org_id uuid,
  _customer_id uuid,
  _amount numeric,
  _source_type text,
  _source_id uuid,
  _description text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_currency text;
  v_new_balance numeric(14,2);
  v_tx_id uuid;
  v_existing_tx uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  IF _source_type IN ('manual','adjustment') THEN
    IF NOT (public.is_org_admin(_org_id)
            OR public.has_org_role(_org_id, 'sales_director'::app_role)) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  -- Idempotência rápida: se já existe transação para este source, devolver
  IF _source_id IS NOT NULL THEN
    SELECT id INTO v_existing_tx
      FROM public.customer_wallet_transactions
     WHERE source_type = _source_type AND source_id = _source_id
     LIMIT 1;
    IF v_existing_tx IS NOT NULL THEN
      RETURN v_existing_tx;
    END IF;
  END IF;

  -- Garante carteira (com moeda da org)
  SELECT currency INTO v_currency FROM public.organizations WHERE id = _org_id;

  INSERT INTO public.customer_wallets (organization_id, customer_id, balance, currency)
  VALUES (_org_id, _customer_id, 0, v_currency)
  ON CONFLICT (organization_id, customer_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_wallet_id;

  -- Atualiza saldo de forma atómica
  UPDATE public.customer_wallets
     SET balance = balance + _amount,
         updated_at = now()
   WHERE id = v_wallet_id
   RETURNING balance INTO v_new_balance;

  BEGIN
    INSERT INTO public.customer_wallet_transactions
      (organization_id, customer_id, wallet_id, type, amount,
       source_type, source_id, description, balance_after)
    VALUES
      (_org_id, _customer_id, v_wallet_id, 'credit', _amount,
       _source_type, _source_id, _description, v_new_balance)
    RETURNING id INTO v_tx_id;
  EXCEPTION WHEN unique_violation THEN
    -- Outro processo concorrente já lançou o mesmo evento: reverter saldo e devolver existente
    UPDATE public.customer_wallets
       SET balance = balance - _amount, updated_at = now()
     WHERE id = v_wallet_id;
    SELECT id INTO v_tx_id
      FROM public.customer_wallet_transactions
     WHERE source_type = _source_type AND source_id = _source_id
     LIMIT 1;
  END;

  RETURN v_tx_id;
END;
$$;

-- ============ Função: wallet_debit ============
CREATE OR REPLACE FUNCTION public.wallet_debit(
  _org_id uuid,
  _customer_id uuid,
  _amount numeric,
  _source_type text,
  _source_id uuid,
  _description text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_currency text;
  v_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_tx_id uuid;
  v_existing_tx uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  IF _source_type IN ('manual','adjustment') THEN
    IF NOT (public.is_org_admin(_org_id)
            OR public.has_org_role(_org_id, 'sales_director'::app_role)) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  IF _source_id IS NOT NULL THEN
    SELECT id INTO v_existing_tx
      FROM public.customer_wallet_transactions
     WHERE source_type = _source_type AND source_id = _source_id
     LIMIT 1;
    IF v_existing_tx IS NOT NULL THEN
      RETURN v_existing_tx;
    END IF;
  END IF;

  SELECT currency INTO v_currency FROM public.organizations WHERE id = _org_id;

  INSERT INTO public.customer_wallets (organization_id, customer_id, balance, currency)
  VALUES (_org_id, _customer_id, 0, v_currency)
  ON CONFLICT (organization_id, customer_id) DO UPDATE SET updated_at = now()
  RETURNING id, balance INTO v_wallet_id, v_balance;

  -- Trava a linha e revalida saldo
  SELECT balance INTO v_balance
    FROM public.customer_wallets
   WHERE id = v_wallet_id
   FOR UPDATE;

  IF v_balance < _amount THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE public.customer_wallets
     SET balance = balance - _amount, updated_at = now()
   WHERE id = v_wallet_id
   RETURNING balance INTO v_new_balance;

  BEGIN
    INSERT INTO public.customer_wallet_transactions
      (organization_id, customer_id, wallet_id, type, amount,
       source_type, source_id, description, balance_after)
    VALUES
      (_org_id, _customer_id, v_wallet_id, 'debit', _amount,
       _source_type, _source_id, _description, v_new_balance)
    RETURNING id INTO v_tx_id;
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.customer_wallets
       SET balance = balance + _amount, updated_at = now()
     WHERE id = v_wallet_id;
    SELECT id INTO v_tx_id
      FROM public.customer_wallet_transactions
     WHERE source_type = _source_type AND source_id = _source_id
     LIMIT 1;
  END;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wallet_credit(uuid, uuid, numeric, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_debit(uuid, uuid, numeric, text, uuid, text) TO authenticated;

-- Trigger touch updated_at
CREATE TRIGGER cw_touch_updated_at
  BEFORE UPDATE ON public.customer_wallets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
