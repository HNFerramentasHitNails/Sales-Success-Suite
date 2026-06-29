
-- 1) Contadores de numeração interna por organização
CREATE TABLE IF NOT EXISTS public.org_invoice_counters (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0
);

GRANT ALL ON public.org_invoice_counters TO service_role;
ALTER TABLE public.org_invoice_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "counters readable by members"
  ON public.org_invoice_counters FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- 2) Função atómica para próximo nº de fatura
CREATE OR REPLACE FUNCTION public.next_invoice_number(_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    -- também permitido a service_role (bypass RLS) — quando chamado por edge function admin
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'not_a_member';
    END IF;
  END IF;

  INSERT INTO public.org_invoice_counters(organization_id, last_number)
  VALUES (_org_id, 1)
  ON CONFLICT (organization_id) DO UPDATE
    SET last_number = public.org_invoice_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'FAT-' || lpad(v_next::text, 5, '0');
END;
$$;

-- 3) Acrescenta external_status às invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS external_status text NOT NULL DEFAULT 'not_synced'
    CHECK (external_status IN ('not_synced','pending','synced','error'));

-- 4) Índice único (organization_id, invoice_number) — invoice_number pode ser null durante transição
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_org_number
  ON public.invoices(organization_id, invoice_number)
  WHERE invoice_number IS NOT NULL;
