CREATE OR REPLACE FUNCTION public.trg_prospect_convert_on_won()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cust uuid;
BEGIN
  IF NEW.pipeline_stage = 'ganho' AND NEW.customer_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.pipeline_stage IS DISTINCT FROM 'ganho') THEN

    IF NEW.email IS NOT NULL AND length(trim(NEW.email)) > 0 THEN
      SELECT id INTO v_cust FROM public.customers
       WHERE organization_id = NEW.organization_id
         AND email IS NOT NULL
         AND lower(email) = lower(trim(NEW.email))
       ORDER BY created_at ASC
       LIMIT 1;
    END IF;

    IF v_cust IS NULL THEN
      INSERT INTO public.customers (organization_id, name, company_name, email, phone, assigned_member_id, created_by, notes_short)
      VALUES (NEW.organization_id, COALESCE(NULLIF(trim(NEW.name),''),'(sem nome)'),
              NULLIF(trim(COALESCE(NEW.company_name,'')),''),
              NULLIF(trim(COALESCE(NEW.email,'')),''),
              NULLIF(trim(COALESCE(NEW.phone,'')),''),
              NEW.assigned_member_id, NEW.created_by, 'Convertido de prospeção')
      RETURNING id INTO v_cust;
    END IF;

    NEW.customer_id := v_cust;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS prospects_convert_on_won ON public.prospects;
CREATE TRIGGER prospects_convert_on_won
  BEFORE INSERT OR UPDATE OF pipeline_stage ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.trg_prospect_convert_on_won();