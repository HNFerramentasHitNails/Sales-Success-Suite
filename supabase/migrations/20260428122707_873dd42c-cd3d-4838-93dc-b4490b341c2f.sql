-- =====================================================
-- PLATFORM ADMIN (super-admin acima de todas as orgs)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID,
  notes TEXT
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Função SECURITY DEFINER (evita recursão RLS)
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id)
$$;

-- Policies: só platform admins veem/gerem a tabela
CREATE POLICY pa_select_self_or_admin ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY pa_insert_admin ON public.platform_admins
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY pa_delete_admin ON public.platform_admins
  FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- =====================================================
-- Estender RLS existentes para permitir acesso global de platform admins
-- (organizations, organization_members, profiles)
-- =====================================================

-- Organizations: platform admins podem ver e atualizar todas
CREATE POLICY org_select_platform_admin ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY org_update_platform_admin ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY org_insert_platform_admin ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- organization_members: platform admins veem todas
CREATE POLICY members_select_platform_admin ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY members_update_platform_admin ON public.organization_members
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY members_insert_platform_admin ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY members_delete_platform_admin ON public.organization_members
  FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Profiles: platform admins veem todos os perfis
CREATE POLICY profiles_select_platform_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- =====================================================
-- Notificações in-app (F7.1)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,                  -- 'invoice_imported', 'commission_approved', 'meeting_reminder', 'system', etc.
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                           -- rota interna a abrir ao clicar
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND organization_id = public.get_user_org(auth.uid()));

CREATE POLICY notif_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notif_insert_org ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org(auth.uid()));

CREATE POLICY notif_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- Bootstrap: criar organização HN Hit Nails + Bruno como owner + platform_admin
-- =====================================================

DO $$
DECLARE
  v_org_id UUID;
  v_user_id UUID := 'fee5df0b-4ad1-491b-950c-f70017603a44';
BEGIN
  -- Criar org se ainda não existir
  SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'hn-hit-nails';
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, plan, status)
    VALUES ('HN Hit Nails', 'hn-hit-nails', 'pro', 'active')
    RETURNING id INTO v_org_id;
  END IF;

  -- Adicionar Bruno como owner (se ainda não for membro)
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner')
  ON CONFLICT DO NOTHING;

  -- Marcar Bruno como platform admin
  INSERT INTO public.platform_admins (user_id, notes)
  VALUES (v_user_id, 'Criador da plataforma — bootstrap inicial')
  ON CONFLICT (user_id) DO NOTHING;
END $$;