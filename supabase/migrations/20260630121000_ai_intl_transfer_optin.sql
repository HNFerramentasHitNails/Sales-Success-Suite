-- ============================================================
-- IA — opt-in informado para transferência internacional (RGPD Cap. V)
-- Fornecedores fora da UE sem decisão de adequação (ex.: DeepSeek/China)
-- só podem ser usados após declaração explícita do cliente.
-- ============================================================
ALTER TABLE public.ai_provider_settings
  ADD COLUMN IF NOT EXISTS intl_transfer_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS intl_transfer_ack_by uuid;

-- get_ai_settings passa a devolver também o estado da declaração.
DROP FUNCTION IF EXISTS public.get_ai_settings(uuid);
CREATE FUNCTION public.get_ai_settings(_org_id uuid)
RETURNS TABLE(provider text, model text, has_key boolean, intl_transfer_ack boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  RETURN QUERY
  SELECT s.provider,
         s.model,
         (s.api_key IS NOT NULL AND length(trim(s.api_key)) > 0) AS has_key,
         (s.intl_transfer_ack_at IS NOT NULL) AS intl_transfer_ack
    FROM public.ai_provider_settings s
   WHERE s.organization_id = _org_id
   LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_ai_settings(uuid) TO authenticated;

-- set_ai_settings aceita a declaração de transferência internacional.
DROP FUNCTION IF EXISTS public.set_ai_settings(uuid, text, text, text);
CREATE FUNCTION public.set_ai_settings(
  _org_id uuid,
  _provider text,
  _model text DEFAULT NULL,
  _api_key text DEFAULT NULL,
  _intl_transfer_ack boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_non_eu boolean;
  v_ack_at timestamptz;
  v_ack_by uuid;
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

  -- Fornecedores fora da UE sem decisão de adequação.
  v_non_eu := _provider IN ('deepseek');

  IF v_non_eu AND COALESCE(_intl_transfer_ack, false) THEN
    v_ack_at := now();
    v_ack_by := auth.uid();
  ELSE
    -- Fornecedor adequado (UE/DPF) ou declaração não dada → limpa a declaração.
    v_ack_at := NULL;
    v_ack_by := NULL;
  END IF;

  INSERT INTO public.ai_provider_settings
    (organization_id, provider, model, api_key, intl_transfer_ack_at, intl_transfer_ack_by, updated_at)
  VALUES (_org_id, _provider, _model, _api_key, v_ack_at, v_ack_by, now())
  ON CONFLICT (organization_id) DO UPDATE
    SET provider   = EXCLUDED.provider,
        model      = EXCLUDED.model,
        api_key    = CASE WHEN EXCLUDED.api_key IS NULL THEN ai_provider_settings.api_key ELSE EXCLUDED.api_key END,
        intl_transfer_ack_at = EXCLUDED.intl_transfer_ack_at,
        intl_transfer_ack_by = EXCLUDED.intl_transfer_ack_by,
        updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.set_ai_settings(uuid, text, text, text, boolean) TO authenticated;
