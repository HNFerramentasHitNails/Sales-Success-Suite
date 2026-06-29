-- Adicionar DeepSeek como fornecedor de IA válido

-- Actualizar constraint de validação (se existir)
ALTER TABLE public.ai_provider_settings
  DROP CONSTRAINT IF EXISTS ai_provider_settings_provider_check;

ALTER TABLE public.ai_provider_settings
  ADD CONSTRAINT ai_provider_settings_provider_check
  CHECK (provider IN ('lovable', 'deepseek', 'anthropic', 'openai'));

-- Actualizar função set_ai_settings para aceitar 'deepseek'
CREATE OR REPLACE FUNCTION public.set_ai_settings(
  _org_id uuid,
  _provider text,
  _model text DEFAULT NULL,
  _api_key text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_org_admin(_org_id) OR public.has_org_role(_org_id, 'sales_director')) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  IF _provider NOT IN ('deepseek', 'anthropic', 'openai') THEN
    RAISE EXCEPTION 'fornecedor inválido';
  END IF;
  IF _api_key IS NOT NULL AND trim(_api_key) = '' THEN
    _api_key := NULL;
  END IF;
  INSERT INTO public.ai_provider_settings (organization_id, provider, model, api_key, updated_at)
  VALUES (_org_id, _provider, _model, _api_key, now())
  ON CONFLICT (organization_id) DO UPDATE
    SET provider   = EXCLUDED.provider,
        model      = EXCLUDED.model,
        api_key    = CASE
                       WHEN EXCLUDED.api_key IS NULL THEN ai_provider_settings.api_key
                       ELSE EXCLUDED.api_key
                     END,
        updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.set_ai_settings(uuid, text, text, text) TO authenticated;

-- Migrar orgs que estejam em 'lovable' para 'deepseek'
UPDATE public.ai_provider_settings
SET provider = 'deepseek', updated_at = now()
WHERE provider = 'lovable';
