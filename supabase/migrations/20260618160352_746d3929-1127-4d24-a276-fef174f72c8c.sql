-- Limpa dados de providers descontinuados (jasmin, keyinvoice) e restringe a constraint.
DELETE FROM public.integration_sync_logs
 WHERE integration_id IN (
   SELECT id FROM public.integrations WHERE provider IN ('jasmin','keyinvoice')
 );
DELETE FROM public.integrations WHERE provider IN ('jasmin','keyinvoice');

-- Substituir o CHECK da coluna provider.
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
    FROM pg_constraint
   WHERE conrelid = 'public.integrations'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%provider%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.integrations DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

ALTER TABLE public.integrations
  ADD CONSTRAINT integrations_provider_check
  CHECK (provider IN ('moloni','invoicexpress','vendus'));