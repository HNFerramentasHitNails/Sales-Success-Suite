-- Remove Odoo integration entirely
DELETE FROM public.organization_modules WHERE module_id = 'odoo';
DELETE FROM public.integrations WHERE provider = 'odoo';

-- Update seed trigger to not include odoo for new orgs
CREATE OR REPLACE FUNCTION public.seed_default_organization_modules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.organization_modules (organization_id, module_id, enabled)
  VALUES
    (NEW.id, 'sales', true),
    (NEW.id, 'ai_agents', true),
    (NEW.id, 'distribution', true),
    (NEW.id, 'moloni', true),
    (NEW.id, 'shopify', true),
    (NEW.id, 'google_calendar', true),
    (NEW.id, 'stripe', true)
  ON CONFLICT (organization_id, module_id) DO NOTHING;
  RETURN NEW;
END $function$;