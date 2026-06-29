
-- =====================================================================
-- HARD RESET of public schema
-- =====================================================================
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT CREATE ON SCHEMA public TO postgres, service_role;

-- =====================================================================
-- ENUM: app_role
-- =====================================================================
CREATE TYPE public.app_role AS ENUM (
  'owner',
  'admin',
  'sales_director',
  'sales_rep',
  'read_only'
);

CREATE TYPE public.member_status AS ENUM ('active', 'invited');
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'expired');

-- =====================================================================
-- Utility: updated_at trigger
-- =====================================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =====================================================================
-- TABLE: profiles
-- =====================================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_profiles_touch
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- TABLE: organizations
-- =====================================================================
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  logo_url text,
  primary_color text NOT NULL DEFAULT '220 50% 23%',
  locale text NOT NULL DEFAULT 'pt-PT',
  currency text NOT NULL DEFAULT 'EUR',
  country text NOT NULL DEFAULT 'PT',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_organizations_touch
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- TABLE: organization_members
-- =====================================================================
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'sales_rep',
  status public.member_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org  ON public.organization_members(organization_id);

CREATE TRIGGER trg_org_members_touch
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- SECURITY DEFINER helpers (avoid RLS recursion)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE organization_id = _org_id
       AND user_id = auth.uid()
       AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE organization_id = _org_id
       AND user_id = auth.uid()
       AND status = 'active'
       AND role IN ('owner','admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE organization_id = _org_id
       AND user_id = auth.uid()
       AND status = 'active'
       AND role = _role
  );
$$;

-- =====================================================================
-- TABLE: invitations
-- =====================================================================
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'sales_rep',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status public.invitation_status NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_invitations_email ON public.invitations(lower(email));
CREATE INDEX idx_invitations_org   ON public.invitations(organization_id);

CREATE TRIGGER trg_invitations_touch
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- RLS POLICIES
-- =====================================================================

-- profiles: utilizador vê e edita o próprio perfil; também vê perfis de quem partilha organização
CREATE POLICY profiles_self_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_members m1
      JOIN public.organization_members m2 ON m2.organization_id = m1.organization_id
      WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id
    )
  );

CREATE POLICY profiles_self_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- organizations: membros leem; owner/admin atualiza; qualquer utilizador autenticado pode criar (onboarding)
CREATE POLICY organizations_member_select ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id));

CREATE POLICY organizations_authenticated_insert ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY organizations_admin_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

CREATE POLICY organizations_owner_delete ON public.organizations
  FOR DELETE TO authenticated
  USING (public.has_org_role(id, 'owner'));

-- organization_members: membros veem outros membros da mesma org; admins gerem
CREATE POLICY org_members_select ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR user_id = auth.uid());

-- INSERT: dois caminhos:
--   (a) admin adiciona qualquer utilizador à sua org
--   (b) o próprio utilizador entra (usado pelo onboarding: ao criar a org torna-se owner)
CREATE POLICY org_members_admin_insert ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR user_id = auth.uid()
  );

CREATE POLICY org_members_admin_update ON public.organization_members
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY org_members_admin_delete ON public.organization_members
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) OR user_id = auth.uid());

-- invitations: admins gerem; utilizador autenticado vê convites para o seu email
CREATE POLICY invitations_admin_select ON public.invitations
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email')::text, ''))
  );

CREATE POLICY invitations_admin_insert ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY invitations_admin_update ON public.invitations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY invitations_admin_delete ON public.invitations
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- =====================================================================
-- RPC: accept_invitation
-- =====================================================================
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invitations;
  v_email text;
BEGIN
  v_email := lower(coalesce((auth.jwt() ->> 'email')::text, ''));
  IF auth.uid() IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.invitations
   WHERE token = _token
     AND status = 'pending'
     AND expires_at > now()
     AND lower(email) = v_email
   LIMIT 1;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_invitation';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_inv.organization_id, auth.uid(), v_inv.role, 'active')
  ON CONFLICT (organization_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, status = 'active';

  UPDATE public.invitations
     SET status = 'accepted', accepted_at = now()
   WHERE id = v_inv.id;

  RETURN v_inv.organization_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
