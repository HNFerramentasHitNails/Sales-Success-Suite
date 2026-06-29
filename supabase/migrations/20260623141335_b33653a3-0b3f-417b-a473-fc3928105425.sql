
CREATE TABLE public.ai_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'anthropic' CHECK (provider IN ('anthropic','openai')),
  model text NULL,
  api_key text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_provider_settings TO service_role;
-- Intencionalmente NÃO concedemos privilégios a authenticated/anon: a tabela
-- é inacessível ao cliente. Acesso só via funções SECURITY DEFINER e service_role.

ALTER TABLE public.ai_provider_settings ENABLE ROW LEVEL SECURITY;
-- Sem políticas para authenticated → cliente não consegue ler/escrever a chave.

CREATE OR REPLACE FUNCTION public.get_ai_settings(_org_id uuid)
RETURNS TABLE(provider text, model text, has_key boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  RETURN QUERY
  SELECT s.provider,
         s.model,
         (s.api_key IS NOT NULL AND length(trim(s.api_key)) > 0) AS has_key
    FROM public.ai_provider_settings s
   WHERE s.organization_id = _org_id
   LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ai_settings(
  _org_id uuid,
  _provider text,
  _model text,
  _api_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  IF NOT (public.is_org_admin(_org_id)
          OR public.has_org_role(_org_id, 'sales_director'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _provider NOT IN ('anthropic','openai') THEN
    RAISE EXCEPTION 'invalid_provider';
  END IF;

  INSERT INTO public.ai_provider_settings (organization_id, provider, model, api_key, updated_at)
  VALUES (_org_id, _provider, NULLIF(trim(_model), ''), NULLIF(_api_key, ''), now())
  ON CONFLICT (organization_id) DO UPDATE
    SET provider   = EXCLUDED.provider,
        model      = EXCLUDED.model,
        -- Se _api_key vier NULL/vazio, mantém a chave atual
        api_key    = COALESCE(NULLIF(_api_key, ''), public.ai_provider_settings.api_key),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ai_settings(uuid, text, text, text) TO authenticated;
