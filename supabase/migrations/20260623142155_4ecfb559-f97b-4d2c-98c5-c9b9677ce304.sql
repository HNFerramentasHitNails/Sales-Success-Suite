
-- Aceitar 'lovable' no CHECK e mudar o DEFAULT
ALTER TABLE public.ai_provider_settings DROP CONSTRAINT IF EXISTS ai_provider_settings_provider_check;
ALTER TABLE public.ai_provider_settings
  ADD CONSTRAINT ai_provider_settings_provider_check
  CHECK (provider IN ('lovable','anthropic','openai'));
ALTER TABLE public.ai_provider_settings ALTER COLUMN provider SET DEFAULT 'lovable';

-- get_ai_settings: quando provider='lovable', has_key=true (não é preciso chave).
-- Se a org não tiver linha, devolve uma linha sintética com provider='lovable'.
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
         CASE
           WHEN s.provider = 'lovable' THEN true
           ELSE (s.api_key IS NOT NULL AND length(trim(s.api_key)) > 0)
         END AS has_key
    FROM public.ai_provider_settings s
   WHERE s.organization_id = _org_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'lovable'::text, NULL::text, true;
  END IF;
END;
$$;

-- set_ai_settings: aceitar 'lovable'; quando 'lovable' a chave é irrelevante.
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
  IF _provider NOT IN ('lovable','anthropic','openai') THEN
    RAISE EXCEPTION 'invalid_provider';
  END IF;

  INSERT INTO public.ai_provider_settings (organization_id, provider, model, api_key, updated_at)
  VALUES (
    _org_id,
    _provider,
    NULLIF(trim(_model), ''),
    CASE WHEN _provider = 'lovable' THEN NULL ELSE NULLIF(_api_key, '') END,
    now()
  )
  ON CONFLICT (organization_id) DO UPDATE
    SET provider   = EXCLUDED.provider,
        model      = EXCLUDED.model,
        api_key    = CASE
                       WHEN EXCLUDED.provider = 'lovable' THEN NULL
                       -- Se _api_key vier NULL/vazio, mantém a chave atual
                       ELSE COALESCE(NULLIF(_api_key, ''), public.ai_provider_settings.api_key)
                     END,
        updated_at = now();
END;
$$;
