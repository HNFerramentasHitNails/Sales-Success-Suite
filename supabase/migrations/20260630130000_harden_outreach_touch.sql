-- RGPD art. 32 / hardening — fixar search_path da função de trigger.
ALTER FUNCTION public.outreach_touch() SET search_path = public;
