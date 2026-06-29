
CREATE TABLE public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','redeemed','expired','canceled')),
  expires_at timestamptz NULL,
  redeemed_at timestamptz NULL,
  redeemed_by uuid NULL,
  notes text NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);
CREATE INDEX idx_vouchers_org_status ON public.vouchers(organization_id, status);
CREATE INDEX idx_vouchers_customer ON public.vouchers(customer_id) WHERE customer_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;
GRANT ALL ON public.vouchers TO service_role;

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vouchers_select_members" ON public.vouchers
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "vouchers_insert_admin" ON public.vouchers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );

CREATE POLICY "vouchers_update_admin" ON public.vouchers
  FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );

CREATE POLICY "vouchers_delete_admin" ON public.vouchers
  FOR DELETE TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR public.has_org_role(organization_id, 'sales_director'::app_role)
  );

CREATE TRIGGER vouchers_touch_updated_at
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ redeem_voucher ============
CREATE OR REPLACE FUNCTION public.redeem_voucher(
  _org_id uuid,
  _voucher_id uuid,
  _customer_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voucher public.vouchers;
  v_target_customer uuid;
  v_tx_id uuid;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  -- precisa ser comercial ativo (não read_only)
  IF NOT (public.is_org_admin(_org_id)
          OR public.has_org_role(_org_id, 'sales_director'::app_role)
          OR public.has_org_role(_org_id, 'sales_rep'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_voucher
    FROM public.vouchers
   WHERE id = _voucher_id AND organization_id = _org_id
   FOR UPDATE;

  IF v_voucher.id IS NULL THEN
    RAISE EXCEPTION 'voucher_not_found';
  END IF;
  IF v_voucher.status <> 'active' THEN
    RAISE EXCEPTION 'voucher_not_active';
  END IF;
  IF v_voucher.expires_at IS NOT NULL AND v_voucher.expires_at <= now() THEN
    -- marca como expirado para refletir o estado
    UPDATE public.vouchers SET status = 'expired', updated_at = now()
      WHERE id = v_voucher.id;
    RAISE EXCEPTION 'voucher_expired';
  END IF;

  -- resolve o cliente
  IF v_voucher.customer_id IS NOT NULL THEN
    IF _customer_id IS NOT NULL AND _customer_id <> v_voucher.customer_id THEN
      RAISE EXCEPTION 'voucher_customer_mismatch';
    END IF;
    v_target_customer := v_voucher.customer_id;
  ELSE
    IF _customer_id IS NULL THEN
      RAISE EXCEPTION 'customer_required';
    END IF;
    v_target_customer := _customer_id;
  END IF;

  -- credita a carteira (idempotente via source_type='voucher' + source_id=voucher.id)
  v_tx_id := public.wallet_credit(
    _org_id,
    v_target_customer,
    v_voucher.amount,
    'voucher',
    v_voucher.id,
    'Resgate de voucher ' || v_voucher.code
  );

  UPDATE public.vouchers
     SET status = 'redeemed',
         redeemed_at = now(),
         redeemed_by = auth.uid(),
         customer_id = COALESCE(customer_id, v_target_customer),
         updated_at = now()
   WHERE id = v_voucher.id;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_voucher(uuid, uuid, uuid) TO authenticated;
