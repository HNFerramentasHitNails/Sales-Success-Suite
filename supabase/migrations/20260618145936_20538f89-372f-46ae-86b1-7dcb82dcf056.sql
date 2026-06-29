
-- 1) Remove the dangerous self-insert branch from organization_members INSERT policy.
-- The invitation flow uses accept_invitation() (SECURITY DEFINER) and bypasses RLS,
-- so legitimate self-joins via invitations continue to work.
DROP POLICY IF EXISTS members_insert_admin ON public.organization_members;
CREATE POLICY members_insert_admin ON public.organization_members
  FOR INSERT
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

-- 2) Make get_user_org deterministic for users with multiple memberships.
CREATE OR REPLACE FUNCTION public.get_user_org(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
  ORDER BY created_at ASC, organization_id ASC
  LIMIT 1
$function$;
