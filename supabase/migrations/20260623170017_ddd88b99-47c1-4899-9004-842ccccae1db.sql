
-- 1a. System wallet credit helper (no membership checks)
CREATE OR REPLACE FUNCTION public._wallet_credit_system(
  _org_id uuid, _customer_id uuid, _amount numeric,
  _source_type text, _source_id uuid, _description text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  -- Idempotência rápida
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
  RETURNING id INTO v_wallet_id;

  UPDATE public.customer_wallets
     SET balance = balance + _amount, updated_at = now()
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

-- 1b. wallet_campaigns table
CREATE TABLE public.wallet_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  basis text NOT NULL DEFAULT 'total' CHECK (basis IN ('total','subtotal')),
  trigger_min_amount numeric(14,2) NOT NULL DEFAULT 0,
  reward_type text NOT NULL CHECK (reward_type IN ('percent','fixed')),
  reward_value numeric(14,2) NOT NULL,
  max_credit numeric(14,2) NULL,
  one_per_customer boolean NOT NULL DEFAULT false,
  eligible_tags text[] NULL,
  starts_at date NULL,
  ends_at date NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_campaigns_org_active ON public.wallet_campaigns(organization_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_campaigns TO authenticated;
GRANT ALL ON public.wallet_campaigns TO service_role;

ALTER TABLE public.wallet_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view wallet campaigns"
  ON public.wallet_campaigns FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Admins/directors can insert wallet campaigns"
  ON public.wallet_campaigns FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));

CREATE POLICY "Admins/directors can update wallet campaigns"
  ON public.wallet_campaigns FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role))
  WITH CHECK (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));

CREATE POLICY "Admins/directors can delete wallet campaigns"
  ON public.wallet_campaigns FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.has_org_role(organization_id, 'sales_director'::app_role));

CREATE TRIGGER trg_wallet_campaigns_touch
  BEFORE UPDATE ON public.wallet_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 1c. Apply wallet campaigns + trigger
CREATE OR REPLACE FUNCTION public.apply_wallet_campaigns(_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
  v_customer uuid;
  v_date date;
  v_subtotal numeric(14,2);
  v_total numeric(14,2);
  v_tags text[];
  c RECORD;
  v_basis numeric(14,2);
  v_amount numeric(14,2);
  v_exists boolean;
BEGIN
  BEGIN
    SELECT o.organization_id, o.customer_id, o.order_date, o.subtotal, o.total
      INTO v_org, v_customer, v_date, v_subtotal, v_total
      FROM public.orders o WHERE o.id = _order_id;

    IF v_customer IS NULL THEN RETURN; END IF;

    SELECT COALESCE(tags, ARRAY[]::text[]) INTO v_tags
      FROM public.customers WHERE id = v_customer;

    FOR c IN
      SELECT * FROM public.wallet_campaigns
       WHERE organization_id = v_org
         AND is_active = true
         AND (starts_at IS NULL OR starts_at <= v_date)
         AND (ends_at IS NULL OR ends_at >= v_date)
    LOOP
      v_basis := CASE c.basis WHEN 'subtotal' THEN v_subtotal ELSE v_total END;
      IF v_basis IS NULL OR v_basis < c.trigger_min_amount THEN CONTINUE; END IF;

      IF c.eligible_tags IS NOT NULL AND array_length(c.eligible_tags,1) > 0 THEN
        IF NOT (v_tags && c.eligible_tags) THEN CONTINUE; END IF;
      END IF;

      IF c.one_per_customer THEN
        SELECT EXISTS (
          SELECT 1 FROM public.customer_wallet_transactions
           WHERE customer_id = v_customer
             AND source_type = 'campaign:'||c.id::text
        ) INTO v_exists;
        IF v_exists THEN CONTINUE; END IF;
      END IF;

      IF c.reward_type = 'percent' THEN
        v_amount := round(v_basis * c.reward_value / 100.0, 2);
      ELSE
        v_amount := c.reward_value;
      END IF;
      IF c.max_credit IS NOT NULL THEN
        v_amount := LEAST(v_amount, c.max_credit);
      END IF;
      IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

      PERFORM public._wallet_credit_system(
        v_org, v_customer, v_amount,
        'campaign:'||c.id::text, _order_id,
        'Campanha: '||c.name
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.sync_logs(organization_id, direction, action, status, message)
      VALUES (v_org, 'inbound', 'wallet_campaign', 'error', SQLERRM);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_orders_apply_wallet_campaigns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('paga','faturada') THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status NOT IN ('paga','faturada')) THEN
      PERFORM public.apply_wallet_campaigns(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_apply_wallet_campaigns ON public.orders;
CREATE TRIGGER trg_orders_apply_wallet_campaigns
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_apply_wallet_campaigns();
