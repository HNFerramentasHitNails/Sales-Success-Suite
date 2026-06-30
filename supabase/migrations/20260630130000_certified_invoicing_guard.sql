-- Tarefa 1 (brief financeiro) — Guard-rails de faturação certificada.
--
-- Em PT, faturas exigem software certificado pela AT (numeração/ATCUD vindos do
-- software certificado). Enquanto não houver um conector certificado ligado, a app
-- não deve fingir emitir documentos fiscais. Guard-rail:
--  - connector_definitions.is_certified marca os conectores de faturação certificados.
--  - Uma fatura cujo conector é certificado NÃO pode ficar status='issued' sem
--    external_id E pdf_url (a numeração/ATCUD têm de vir do software certificado).
--  - O conector genérico (não certificado) mantém o comportamento atual; estas faturas
--    são sinalizadas como não-conformes pela reconciliação (get_financial_exceptions).

ALTER TABLE public.connector_definitions
  ADD COLUMN IF NOT EXISTS is_certified boolean NOT NULL DEFAULT false;

-- O webhook genérico não é certificado (deixa explícito).
UPDATE public.connector_definitions SET is_certified = false WHERE key = 'generic_webhook_invoicing';

-- Invariante: conector certificado ⇒ não há 'issued' sem external_id + pdf_url.
CREATE OR REPLACE FUNCTION public.trg_invoices_certified_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cert boolean;
BEGIN
  IF NEW.status = 'issued' AND NEW.connector_key IS NOT NULL THEN
    SELECT COALESCE(is_certified, false) INTO v_cert
      FROM public.connector_definitions WHERE key = NEW.connector_key;
    IF COALESCE(v_cert, false) AND (NEW.external_id IS NULL OR NEW.pdf_url IS NULL) THEN
      RAISE EXCEPTION 'certified_invoice_requires_external_id_and_pdf'
        USING HINT = 'Uma fatura emitida por conector certificado tem de ter external_id e pdf_url (numeração/ATCUD do software certificado).';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_invoices_certified_guard ON public.invoices;
CREATE TRIGGER trg_invoices_certified_guard
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoices_certified_guard();
