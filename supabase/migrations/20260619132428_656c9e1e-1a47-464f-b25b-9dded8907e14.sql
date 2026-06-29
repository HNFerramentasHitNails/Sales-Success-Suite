
DROP POLICY IF EXISTS profiles_update_org_admin ON public.profiles;
CREATE POLICY profiles_update_org_admin ON public.profiles
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = profiles.id
      AND public.is_org_admin(auth.uid(), m.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = profiles.id
      AND public.is_org_admin(auth.uid(), m.organization_id)
  ));
