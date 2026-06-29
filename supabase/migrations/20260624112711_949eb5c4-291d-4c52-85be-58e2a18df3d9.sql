-- Função pura: calcula tratamento de IVA sem escrever nada.
CREATE OR REPLACE FUNCTION public._compute_vat_treatment(p_org_id uuid, p_customer_id uuid, p_ship_country text)
RETURNS TABLE(treatment text, destination_rate numeric, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_seller text; v_ship_raw text; v_ship text;
  v_cc text; v_vat text; v_vatok boolean;
  v_seller_eu boolean; v_ship_eu boolean; v_b2b boolean; v_vies boolean;
  v_oss boolean; v_t_rc text; v_t_exp text; v_t_oss text;
  v_treat text; v_reason text; v_dest numeric;
BEGIN
  SELECT upper(trim(coalesce(country,'PT'))) INTO v_seller FROM public.organizations WHERE id=p_org_id;
  IF v_seller IS NULL OR v_seller='' THEN v_seller:='PT'; END IF;
  SELECT country, vat_number, vat_valid INTO v_cc, v_vat, v_vatok FROM public.customers WHERE id=p_customer_id;
  v_ship_raw := coalesce(nullif(trim(p_ship_country),''), nullif(trim(v_cc),''), v_seller);
  IF EXISTS(SELECT 1 FROM public.eu_vat_rates WHERE country_code=upper(v_ship_raw)) THEN
    v_ship := upper(v_ship_raw);
  ELSE
    SELECT country_code INTO v_ship FROM public.eu_vat_rates WHERE lower(country_name)=lower(v_ship_raw) LIMIT 1;
    IF v_ship IS NULL THEN v_ship := upper(v_ship_raw); END IF;
  END IF;
  v_seller_eu := EXISTS(SELECT 1 FROM public.eu_vat_rates WHERE country_code=v_seller);
  v_ship_eu := EXISTS(SELECT 1 FROM public.eu_vat_rates WHERE country_code=v_ship);
  v_b2b := v_vat IS NOT NULL AND length(trim(v_vat))>0;
  v_vies := coalesce(v_vatok,false);
  SELECT oss_enabled, text_reverse_charge, text_export, text_oss INTO v_oss, v_t_rc, v_t_exp, v_t_oss
    FROM public.org_vat_settings WHERE organization_id=p_org_id;
  IF NOT FOUND THEN
    v_oss:=false;
    v_t_rc:='Isento ao abrigo do artigo 14.º do RITI (transmissão intracomunitária de bens). IVA devido pelo adquirente — autoliquidação (reverse charge).';
    v_t_exp:='Isento — exportação de bens, artigo 14.º do CIVA.';
    v_t_oss:='IVA do país de destino ao abrigo do regime OSS (One-Stop-Shop).';
  END IF;
  IF v_ship = v_seller THEN
    v_treat:='domestic'; v_reason:=NULL; v_dest:=NULL;
  ELSIF NOT v_ship_eu THEN
    v_treat:='export'; v_reason:=v_t_exp; v_dest:=0;
  ELSIF v_ship_eu AND v_seller_eu THEN
    IF v_b2b AND v_vies THEN
      v_treat:='reverse_charge'; v_reason:=v_t_rc; v_dest:=0;
    ELSE
      IF v_oss THEN
        SELECT standard_rate INTO v_dest FROM public.eu_vat_rates WHERE country_code=v_ship;
        v_treat:='oss_destination'; v_reason:=v_t_oss||' ('||v_ship||' '||v_dest||'%).';
      ELSE
        v_treat:='domestic'; v_reason:=NULL; v_dest:=NULL;
      END IF;
    END IF;
  ELSE
    v_treat:='domestic'; v_reason:=NULL; v_dest:=NULL;
  END IF;
  RETURN QUERY SELECT v_treat, v_dest, v_reason;
END $$;
GRANT EXECUTE ON FUNCTION public._compute_vat_treatment(uuid,uuid,text) TO authenticated, service_role;

-- Reescreve resolve_order_vat_treatment para reutilizar a função pura.
CREATE OR REPLACE FUNCTION public.resolve_order_vat_treatment(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_cust uuid; v_ship text; v_treat text; v_dest numeric; v_reason text;
BEGIN
  SELECT organization_id, customer_id, ship_to_country INTO v_org, v_cust, v_ship FROM public.orders WHERE id=p_order_id;
  IF v_org IS NULL THEN RETURN; END IF;
  SELECT treatment, destination_rate, reason INTO v_treat, v_dest, v_reason
    FROM public._compute_vat_treatment(v_org, v_cust, v_ship);
  UPDATE public.orders SET vat_treatment=v_treat, vat_exemption_reason=v_reason, vat_destination_rate=v_dest WHERE id=p_order_id;
  PERFORM public.recalc_order_totals_for(p_order_id);
END $$;

-- RPC de pré-visualização só de leitura, protegido por is_org_member.
CREATE OR REPLACE FUNCTION public.preview_order_vat(p_org_id uuid, p_customer_id uuid, p_ship_country text DEFAULT NULL)
RETURNS TABLE(treatment text, destination_rate numeric, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public._compute_vat_treatment(p_org_id, p_customer_id, p_ship_country);
END $$;
GRANT EXECUTE ON FUNCTION public.preview_order_vat(uuid,uuid,text) TO authenticated, service_role;
