-- ============================================================
-- Consentimento (RGPD): prova de aceitação de termos/privacidade
-- e opt-in de marketing no perfil do utilizador.
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version      text,
  ADD COLUMN IF NOT EXISTS privacy_version    text,
  ADD COLUMN IF NOT EXISTS marketing_opt_in   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz;

-- Atualiza o trigger de criação de perfil para gravar a prova de consentimento
-- proveniente dos metadados do registo (options.data no signUp).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_terms_ok boolean := COALESCE((v_meta->>'terms_accepted')::boolean, false);
  v_mkt boolean := COALESCE((v_meta->>'marketing_opt_in')::boolean, false);
  v_accepted_at timestamptz := COALESCE(NULLIF(v_meta->>'terms_accepted_at','')::timestamptz, now());
BEGIN
  INSERT INTO public.profiles (
    id, full_name,
    terms_accepted_at, terms_version, privacy_version,
    marketing_opt_in, marketing_opt_in_at
  )
  VALUES (
    NEW.id,
    COALESCE(v_meta->>'full_name', NEW.email),
    CASE WHEN v_terms_ok THEN v_accepted_at ELSE NULL END,
    NULLIF(v_meta->>'terms_version', ''),
    NULLIF(v_meta->>'privacy_version', ''),
    v_mkt,
    CASE WHEN v_mkt THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
