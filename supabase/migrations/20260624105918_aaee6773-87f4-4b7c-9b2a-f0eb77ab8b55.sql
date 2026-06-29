-- ============================================================
-- Módulo de IVA intracomunitário — Fase 1 (BD + funções)
-- Idempotente: pode correr de novo sem erro.
-- ============================================================

-- 1) MORADAS DE ENTREGA --------------------------------------

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS shipping_same_as_billing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_postal_code text,
  ADD COLUMN IF NOT EXISTS shipping_country text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ship_to_name text,
  ADD COLUMN IF NOT EXISTS ship_to_address text,
  ADD COLUMN IF NOT EXISTS ship_to_city text,
  ADD COLUMN IF NOT EXISTS ship_to_postal_code text,
  ADD COLUMN IF NOT EXISTS ship_to_country text,
  ADD COLUMN IF NOT EXISTS vat_treatment text NOT NULL DEFAULT 'domestic',
  ADD COLUMN IF NOT EXISTS vat_exemption_reason text,
  ADD COLUMN IF NOT EXISTS vat_destination_rate numeric;

-- CHECK no vat_treatment (recria de forma idempotente)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_vat_treatment_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_vat_treatment_check
  CHECK (vat_treatment IN ('domestic','reverse_charge','export','oss_destination','exempt'));

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS vat_treatment text,
  ADD COLUMN IF NOT EXISTS vat_exemption_reason text;


-- 2) TAXAS UE (tabela de referência) -------------------------

CREATE TABLE IF NOT EXISTS public.eu_vat_rates (
  country_code  text PRIMARY KEY,
  country_name  text NOT NULL,
  standard_rate numeric NOT NULL
);

GRANT SELECT ON public.eu_vat_rates TO authenticated;
GRANT ALL    ON public.eu_vat_rates TO service_role;

ALTER TABLE public.eu_vat_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eu_vat_rates_select_authenticated" ON public.eu_vat_rates;
CREATE POLICY "eu_vat_rates_select_authenticated"
  ON public.eu_vat_rates FOR SELECT TO authenticated USING (true);

-- Seed dos 27 estados-membros (taxa normal de referência).
INSERT INTO public.eu_vat_rates(country_code, country_name, standard_rate) VALUES
  ('AT','Áustria',20),('BE','Bélgica',21),('BG','Bulgária',20),('HR','Croácia',25),
  ('CY','Chipre',19),('CZ','Chéquia',21),('DK','Dinamarca',25),('EE','Estónia',22),
  ('FI','Finlândia',25.5),('FR','França',20),('DE','Alemanha',19),('GR','Grécia',24),
  ('HU','Hungria',27),('IE','Irlanda',23),('IT','Itália',22),('LV','Letónia',21),
  ('LT','Lituânia',21),('LU','Luxemburgo',17),('MT','Malta',18),('NL','Países Baixos',21),
  ('PL','Polónia',23),('PT','Portugal',23),('RO','Roménia',19),('SK','Eslováquia',23),
  ('SI','Eslovénia',22),('ES','Espanha',21),('SE','Suécia',25)
ON CONFLICT (country_code) DO UPDATE
  SET country_name  = EXCLUDED.country_name,
      standard_rate = EXCLUDED.standard_rate;


-- 3) DEFINIÇÕES DE IVA POR ORGANIZAÇÃO -----------------------

CREATE TABLE IF NOT EXISTS public.org_vat_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  oss_enabled boolean NOT NULL DEFAULT false,
  text_reverse_charge text NOT NULL DEFAULT 'Isento ao abrigo do artigo 14.º do RITI (transmissão intracomunitária de bens). IVA devido pelo adquirente — autoliquidação (reverse charge).',
  text_export text NOT NULL DEFAULT 'Isento — exportação de bens, artigo 14.º do CIVA.',
  text_oss text NOT NULL DEFAULT 'IVA do país de destino ao abrigo do regime OSS (One-Stop-Shop).',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_vat_settings TO authenticated;
GRANT ALL ON public.org_vat_settings TO service_role;

ALTER TABLE public.org_vat_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_vat_settings_select" ON public.org_vat_settings;
CREATE POLICY "org_vat_settings_select"
  ON public.org_vat_settings FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "org_vat_settings_insert" ON public.org_vat_settings;
CREATE POLICY "org_vat_settings_insert"
  ON public.org_vat_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id)
              OR public.has_org_role(organization_id, 'sales_director'));

DROP POLICY IF EXISTS "org_vat_settings_update" ON public.org_vat_settings;
CREATE POLICY "org_vat_settings_update"
  ON public.org_vat_settings FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id)
         OR public.has_org_role(organization_id, 'sales_director'))
  WITH CHECK (public.is_org_admin(organization_id)
              OR public.has_org_role(organization_id, 'sales_director'));


-- 4) FUNÇÕES -------------------------------------------------

-- (a) Recalcula totais de uma encomenda em função do tratamento fiscal.
CREATE OR REPLACE FUNCTION public.recalc_order_totals_for(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub numeric(14,2);
  v_line_tax numeric(14,2);
  v_tax numeric(14,2);
  v_treat text;
  v_dest numeric;
BEGIN
  SELECT COALESCE(SUM(line_subtotal),0)::numeric(14,2),
         COALESCE(SUM(line_tax),0)::numeric(14,2)
    INTO v_sub, v_line_tax
  FROM public.order_lines
  WHERE order_id = p_order_id;

  SELECT vat_treatment, vat_destination_rate
    INTO v_treat, v_dest
  FROM public.orders WHERE id = p_order_id;

  v_tax := CASE v_treat
    WHEN 'domestic'        THEN v_line_tax
    WHEN 'reverse_charge'  THEN 0
    WHEN 'export'          THEN 0
    WHEN 'exempt'          THEN 0
    WHEN 'oss_destination' THEN round(v_sub * COALESCE(v_dest,0)/100, 2)
    ELSE v_line_tax
  END;

  UPDATE public.orders
     SET subtotal = v_sub,
         tax_total = v_tax,
         total = v_sub + v_tax,
         updated_at = now()
   WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_order_totals_for(uuid) TO authenticated, service_role;

-- (b) O trigger nas linhas apenas delega no recalc_order_totals_for.
CREATE OR REPLACE FUNCTION public.recalc_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  PERFORM public.recalc_order_totals_for(v_order_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- (c) Cérebro fiscal: decide o tratamento de IVA para uma encomenda.
CREATE OR REPLACE FUNCTION public.resolve_order_vat_treatment(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_customer_id uuid;
  v_ship_raw text;
  v_cust_country text;
  v_cust_vat text;
  v_cust_vat_valid boolean;
  v_seller_country text;
  v_ship_country text;
  v_seller_in_eu boolean;
  v_ship_in_eu boolean;
  v_is_b2b boolean;
  v_vies_ok boolean;
  v_oss boolean;
  v_text_rc text;
  v_text_exp text;
  v_text_oss text;
  v_treat text;
  v_reason text;
  v_dest numeric;
BEGIN
  -- Carrega encomenda + cliente.
  SELECT o.organization_id, o.customer_id, o.ship_to_country,
         c.country, c.vat_number, c.vat_valid
    INTO v_org_id, v_customer_id, v_ship_raw,
         v_cust_country, v_cust_vat, v_cust_vat_valid
    FROM public.orders o
    LEFT JOIN public.customers c ON c.id = o.customer_id
   WHERE o.id = p_order_id;

  IF v_org_id IS NULL THEN
    RETURN; -- encomenda não existe.
  END IF;

  -- País do vendedor (default PT).
  SELECT upper(trim(COALESCE(country,'PT'))) INTO v_seller_country
    FROM public.organizations WHERE id = v_org_id;
  IF v_seller_country IS NULL OR v_seller_country = '' THEN
    v_seller_country := 'PT';
  END IF;

  -- País de entrega (raw): ship_to_country -> customer.country -> seller_country.
  v_ship_raw := COALESCE(
    NULLIF(trim(v_ship_raw),''),
    NULLIF(trim(v_cust_country),''),
    v_seller_country
  );

  -- Resolve para ISO-2: tenta como código; se falhar, tenta por nome (case-insensitive).
  IF EXISTS (SELECT 1 FROM public.eu_vat_rates WHERE country_code = upper(v_ship_raw)) THEN
    v_ship_country := upper(v_ship_raw);
  ELSE
    SELECT country_code INTO v_ship_country
      FROM public.eu_vat_rates
     WHERE lower(country_name) = lower(v_ship_raw)
     LIMIT 1;
    IF v_ship_country IS NULL THEN
      v_ship_country := upper(v_ship_raw);
    END IF;
  END IF;

  v_seller_in_eu := EXISTS(SELECT 1 FROM public.eu_vat_rates WHERE country_code = v_seller_country);
  v_ship_in_eu   := EXISTS(SELECT 1 FROM public.eu_vat_rates WHERE country_code = v_ship_country);
  v_is_b2b := v_cust_vat IS NOT NULL AND length(trim(v_cust_vat)) > 0;
  v_vies_ok := COALESCE(v_cust_vat_valid, false);

  -- Carrega definições da org (ou defaults).
  SELECT oss_enabled, text_reverse_charge, text_export, text_oss
    INTO v_oss, v_text_rc, v_text_exp, v_text_oss
    FROM public.org_vat_settings WHERE organization_id = v_org_id;
  IF NOT FOUND THEN
    v_oss := false;
    v_text_rc := 'Isento ao abrigo do artigo 14.º do RITI (transmissão intracomunitária de bens). IVA devido pelo adquirente — autoliquidação (reverse charge).';
    v_text_exp := 'Isento — exportação de bens, artigo 14.º do CIVA.';
    v_text_oss := 'IVA do país de destino ao abrigo do regime OSS (One-Stop-Shop).';
  END IF;

  -- Decisão fiscal.
  IF v_ship_country = v_seller_country THEN
    v_treat := 'domestic'; v_reason := NULL; v_dest := NULL;
  ELSIF NOT v_ship_in_eu THEN
    v_treat := 'export'; v_reason := v_text_exp; v_dest := 0;
  ELSIF v_ship_in_eu AND v_seller_in_eu THEN
    IF v_is_b2b AND v_vies_ok THEN
      v_treat := 'reverse_charge'; v_reason := v_text_rc; v_dest := 0;
    ELSE
      IF v_oss THEN
        SELECT standard_rate INTO v_dest FROM public.eu_vat_rates WHERE country_code = v_ship_country;
        v_treat := 'oss_destination';
        v_reason := v_text_oss || ' (' || v_ship_country || ' ' || v_dest || '%).';
      ELSE
        v_treat := 'domestic'; v_reason := NULL; v_dest := NULL;
      END IF;
    END IF;
  ELSE
    v_treat := 'domestic'; v_reason := NULL; v_dest := NULL;
  END IF;

  UPDATE public.orders
     SET vat_treatment = v_treat,
         vat_exemption_reason = v_reason,
         vat_destination_rate = v_dest,
         ship_to_country = COALESCE(NULLIF(trim(ship_to_country),''), v_ship_country)
   WHERE id = p_order_id;

  PERFORM public.recalc_order_totals_for(p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_order_vat_treatment(uuid) TO authenticated, service_role;

-- (d) Trigger AFTER INSERT em orders.
CREATE OR REPLACE FUNCTION public.trg_orders_resolve_vat_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.resolve_order_vat_treatment(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_resolve_vat_after_insert ON public.orders;
CREATE TRIGGER trg_orders_resolve_vat_after_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_resolve_vat_ins();

-- (e) Trigger AFTER UPDATE em customers — recomputa encomendas abertas
--     quando muda vat_valid, country ou shipping_country.
CREATE OR REPLACE FUNCTION public.trg_customers_recompute_vat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF (NEW.vat_valid IS DISTINCT FROM OLD.vat_valid)
     OR (NEW.country IS DISTINCT FROM OLD.country)
     OR (NEW.shipping_country IS DISTINCT FROM OLD.shipping_country) THEN
    FOR r IN
      SELECT id FROM public.orders
       WHERE customer_id = NEW.id
         AND status IN ('rascunho','confirmada')
    LOOP
      PERFORM public.resolve_order_vat_treatment(r.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_recompute_vat_after_update ON public.customers;
CREATE TRIGGER trg_customers_recompute_vat_after_update
  AFTER UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.trg_customers_recompute_vat();
