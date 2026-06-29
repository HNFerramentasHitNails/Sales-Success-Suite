CREATE OR REPLACE FUNCTION public.import_customers(p_org uuid, p_rows jsonb, p_match text DEFAULT 'email', p_on_dup text DEFAULT 'update')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r jsonb; v_name text; v_email text; v_phone text; v_vat text; v_match_val text; v_existing uuid;
  ins int:=0; upd int:=0; skip int:=0;
BEGIN
  IF NOT public.is_org_member(p_org) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'p_rows tem de ser um array'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) AS value LOOP
    v_name := nullif(btrim(r->>'name'),'');
    IF v_name IS NULL THEN skip:=skip+1; CONTINUE; END IF;
    v_email := lower(nullif(btrim(r->>'email'),''));
    v_phone := nullif(btrim(r->>'phone'),'');
    v_vat := nullif(btrim(r->>'vat_number'),'');
    v_existing := NULL;
    v_match_val := CASE p_match WHEN 'email' THEN v_email WHEN 'phone' THEN v_phone WHEN 'vat_number' THEN v_vat ELSE NULL END;
    IF v_match_val IS NOT NULL THEN
      SELECT id INTO v_existing FROM public.customers
       WHERE organization_id=p_org AND CASE p_match
              WHEN 'email' THEN lower(email)=v_match_val
              WHEN 'phone' THEN phone=v_match_val
              WHEN 'vat_number' THEN vat_number=v_match_val END
       LIMIT 1;
    END IF;
    IF v_existing IS NOT NULL THEN
      IF p_on_dup='skip' THEN skip:=skip+1; CONTINUE; END IF;
      UPDATE public.customers SET
        name=v_name,
        email=COALESCE(v_email,email),
        phone=COALESCE(v_phone,phone),
        company_name=COALESCE(nullif(btrim(r->>'company_name'),''),company_name),
        vat_number=COALESCE(v_vat,vat_number),
        country=COALESCE(nullif(btrim(r->>'country'),''),country),
        segment=COALESCE(nullif(btrim(r->>'segment'),''),segment),
        address=COALESCE(nullif(btrim(r->>'address'),''),address),
        city=COALESCE(nullif(btrim(r->>'city'),''),city),
        postal_code=COALESCE(nullif(btrim(r->>'postal_code'),''),postal_code),
        notes_short=COALESCE(nullif(btrim(r->>'notes_short'),''),notes_short),
        updated_at=now()
       WHERE id=v_existing;
      upd:=upd+1;
    ELSE
      INSERT INTO public.customers(organization_id,name,email,phone,company_name,vat_number,country,segment,address,city,postal_code,notes_short,is_active,created_by)
      VALUES(p_org,v_name,v_email,v_phone,
        nullif(btrim(r->>'company_name'),''),v_vat,nullif(btrim(r->>'country'),''),nullif(btrim(r->>'segment'),''),
        nullif(btrim(r->>'address'),''),nullif(btrim(r->>'city'),''),nullif(btrim(r->>'postal_code'),''),
        nullif(btrim(r->>'notes_short'),''),true,auth.uid());
      ins:=ins+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('inserted',ins,'updated',upd,'skipped',skip,'total',jsonb_array_length(p_rows));
END $$;

GRANT EXECUTE ON FUNCTION public.import_customers(uuid,jsonb,text,text) TO authenticated;