-- 1. Add is_active to organization_members
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. access_groups
CREATE TYPE public.access_group_kind AS ENUM ('commercial', 'sales_director', 'custom');

CREATE TABLE public.access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  kind public.access_group_kind NOT NULL DEFAULT 'custom',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

ALTER TABLE public.access_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ag_select_same_org" ON public.access_groups
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));

CREATE POLICY "ag_insert_admin" ON public.access_groups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "ag_update_admin" ON public.access_groups
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "ag_delete_admin" ON public.access_groups
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER trg_access_groups_updated
  BEFORE UPDATE ON public.access_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. access_group_members
CREATE TABLE public.access_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

ALTER TABLE public.access_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agm_select_same_org" ON public.access_group_members
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));

CREATE POLICY "agm_insert_admin" ON public.access_group_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "agm_delete_admin" ON public.access_group_members
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE INDEX idx_agm_user ON public.access_group_members(user_id);
CREATE INDEX idx_agm_group ON public.access_group_members(group_id);

-- 4. invitations
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'sales_agent',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_select_same_org" ON public.invitations
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));

CREATE POLICY "inv_select_own_email" ON public.invitations
  FOR SELECT TO authenticated
  USING (lower(email) = lower((auth.jwt() ->> 'email')));

CREATE POLICY "inv_insert_admin" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) AND invited_by = auth.uid());

CREATE POLICY "inv_delete_admin" ON public.invitations
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "inv_update_accept" ON public.invitations
  FOR UPDATE TO authenticated
  USING (lower(email) = lower((auth.jwt() ->> 'email')));

CREATE INDEX idx_invitations_email ON public.invitations(lower(email));
CREATE INDEX idx_invitations_org ON public.invitations(organization_id);

-- 5. RPC to accept invitation atomically
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
  v_email := lower((auth.jwt() ->> 'email'));
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.invitations
   WHERE token = _token
     AND accepted_at IS NULL
     AND expires_at > now()
     AND lower(email) = v_email
   LIMIT 1;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_invitation';
  END IF;

  -- create membership (skip if exists)
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_inv.organization_id, auth.uid(), v_inv.role)
  ON CONFLICT DO NOTHING;

  UPDATE public.invitations
     SET accepted_at = now()
   WHERE id = v_inv.id;

  RETURN v_inv.organization_id;
END;
$$;
