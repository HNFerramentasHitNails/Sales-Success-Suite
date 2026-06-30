-- Tarefa 10 (brief financeiro) — Séries de numeração separadas e auditáveis.
--
-- Fatura usa a série FAT-xxxxx (org_invoice_counters / next_invoice_number).
-- Nota de crédito passa a ter série PRÓPRIA NC-xxxxx (separada, sequencial, sem reutilização).
-- Cancelamentos de encomenda passam a ser ESTADO ('cancelada'), não eliminação (ver UI).

CREATE TABLE IF NOT EXISTS public.org_credit_note_counters (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0
);

ALTER TABLE public.org_credit_note_counters ENABLE ROW LEVEL SECURITY;

-- Sem políticas para authenticated: só acessível via SECURITY DEFINER / service_role.

CREATE OR REPLACE FUNCTION public.next_credit_note_number(_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_next integer;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'not_a_member';
    END IF;
  END IF;

  INSERT INTO public.org_credit_note_counters(organization_id, last_number)
  VALUES (_org_id, 1)
  ON CONFLICT (organization_id) DO UPDATE
    SET last_number = public.org_credit_note_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'NC-' || lpad(v_next::text, 5, '0');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.next_credit_note_number(uuid) TO authenticated;
