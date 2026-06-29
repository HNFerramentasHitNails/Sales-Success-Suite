
-- Revogar SELECT da coluna sensível "credentials" para os roles do Data API.
REVOKE SELECT (credentials) ON public.integrations FROM authenticated;
REVOKE SELECT (credentials) ON public.integrations FROM anon;

-- Garantir que UPDATE da coluna credentials também é bloqueado a partir do browser
-- (o backend usa service_role e não é afetado).
REVOKE UPDATE (credentials) ON public.integrations FROM authenticated;
REVOKE INSERT (credentials) ON public.integrations FROM authenticated;

-- Vista segura que omite credentials e expõe um booleano has_credentials.
CREATE OR REPLACE VIEW public.integrations_safe
WITH (security_invoker = true) AS
SELECT
  id,
  organization_id,
  provider,
  is_active,
  sync_direction,
  config,
  last_sync_at,
  last_sync_status,
  created_at,
  updated_at,
  (credentials IS NOT NULL AND credentials <> '{}'::jsonb) AS has_credentials
FROM public.integrations;

GRANT SELECT ON public.integrations_safe TO authenticated;
GRANT SELECT ON public.integrations_safe TO service_role;
