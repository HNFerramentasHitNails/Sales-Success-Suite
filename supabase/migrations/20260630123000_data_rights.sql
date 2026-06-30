-- ============================================================
-- Direitos dos titulares (RGPD arts. 15–20)
-- Exportar dados pessoais e pedir eliminação da conta.
-- ============================================================

-- Pedidos de eliminação de conta (processados em ≤ 30 dias).
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS adr_one_open_per_user
  ON public.account_deletion_requests(user_id) WHERE status IN ('pending','processing');
GRANT SELECT ON public.account_deletion_requests TO authenticated;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS adr_sel ON public.account_deletion_requests;
CREATE POLICY adr_sel ON public.account_deletion_requests FOR SELECT USING (user_id = auth.uid());

-- Exportar os dados pessoais do próprio utilizador (perfil + pertenças).
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT jsonb_build_object(
    'exported_at', now(),
    'user', jsonb_build_object('id', v_uid, 'email', (SELECT email FROM auth.users WHERE id = v_uid)),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = v_uid),
    'memberships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'organization_id', m.organization_id,
        'organization_name', o.name,
        'role', m.role,
        'status', m.status,
        'joined_at', m.created_at
      ))
      FROM public.organization_members m
      JOIN public.organizations o ON o.id = m.organization_id
      WHERE m.user_id = v_uid
    ), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END $$;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- Registar um pedido de eliminação de conta.
CREATE OR REPLACE FUNCTION public.request_account_deletion(_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT id INTO v_id FROM public.account_deletion_requests
   WHERE user_id = v_uid AND status IN ('pending','processing') LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.account_deletion_requests (user_id, reason)
  VALUES (v_uid, NULLIF(trim(_reason), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO authenticated;
