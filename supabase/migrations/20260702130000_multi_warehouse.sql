-- Suporta vários armazéns por organização (antes só existia um endereço fixo em
-- organizations.warehouse_*). Cada encomenda pode escolher o seu armazém de origem
-- (para a fatura/documento de transporte ter sempre a morada correta); por defeito
-- usa o armazém marcado como predefinido da organização.

CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text,
  postal_code text,
  country text DEFAULT 'PT',
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Só pode haver um armazém predefinido por organização.
CREATE UNIQUE INDEX warehouses_one_default_per_org
  ON public.warehouses (organization_id) WHERE is_default;
CREATE INDEX warehouses_org_idx ON public.warehouses (organization_id);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouses_sel ON public.warehouses FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY warehouses_ins ON public.warehouses FOR INSERT
  WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY warehouses_upd ON public.warehouses FOR UPDATE
  USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY warehouses_del ON public.warehouses FOR DELETE
  USING (public.is_org_admin(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO service_role;

CREATE OR REPLACE FUNCTION public.set_default_warehouse(_warehouse_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.warehouses WHERE id = _warehouse_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'warehouse_not_found'; END IF;
  IF NOT public.is_org_admin(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.warehouses SET is_default = false, updated_at = now() WHERE organization_id = v_org AND is_default;
  UPDATE public.warehouses SET is_default = true, updated_at = now() WHERE id = _warehouse_id;
END
$function$;

GRANT EXECUTE ON FUNCTION public.set_default_warehouse(uuid) TO authenticated;

-- Migra a morada única existente (se preenchida) para a tabela nova, como predefinida.
INSERT INTO public.warehouses (organization_id, name, address, city, postal_code, country, is_default)
SELECT id, COALESCE(NULLIF(warehouse_name, ''), 'Armazém principal'), warehouse_address, warehouse_city,
       warehouse_postal_code, COALESCE(warehouse_country, 'PT'), true
FROM public.organizations
WHERE warehouse_address IS NOT NULL AND trim(warehouse_address) <> '';

-- Encomendas: armazém de origem (opcional; sem valor usa o predefinido da organização).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
