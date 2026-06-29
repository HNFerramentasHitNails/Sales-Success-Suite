
GRANT SELECT ON public.plans TO anon;
DROP POLICY IF EXISTS plans_select_public_anon ON public.plans;
CREATE POLICY plans_select_public_anon ON public.plans
  FOR SELECT TO anon
  USING (is_public = true AND is_active = true);
