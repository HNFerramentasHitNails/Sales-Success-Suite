-- Enum
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('rascunho','confirmada','paga','faturada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contadores por organização para numeração atómica
CREATE TABLE public.org_order_counters (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.org_order_counters TO authenticated;
GRANT ALL ON public.org_order_counters TO service_role;
ALTER TABLE public.org_order_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "counters_select_members" ON public.org_order_counters
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- Função atómica para gerar próximo número de encomenda
CREATE OR REPLACE FUNCTION public.next_order_number(_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  INSERT INTO public.org_order_counters(organization_id, last_number)
  VALUES (_org_id, 1)
  ON CONFLICT (organization_id) DO UPDATE
    SET last_number = public.org_order_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'ENC-' || lpad(v_next::text, 5, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_order_number(uuid) TO authenticated;

-- Tabela orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  status public.order_status NOT NULL DEFAULT 'rascunho',
  assigned_member_id uuid REFERENCES public.organization_members(id) ON DELETE SET NULL,
  order_date date NOT NULL DEFAULT current_date,
  currency text NOT NULL DEFAULT 'EUR',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, order_number)
);
CREATE INDEX orders_org_idx ON public.orders(organization_id, order_date DESC);
CREATE INDEX orders_customer_idx ON public.orders(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "orders_insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id) AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::public.app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::public.app_role)
    )
  );
CREATE POLICY "orders_update" ON public.orders FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id) AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::public.app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::public.app_role)
    )
  );
CREATE POLICY "orders_delete" ON public.orders FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE TRIGGER trg_orders_touch BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tabela order_lines (com colunas geradas)
CREATE TABLE public.order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  discount_percent numeric(6,3) NOT NULL DEFAULT 0,
  line_subtotal numeric(14,4) GENERATED ALWAYS AS
    (quantity * unit_price * (1 - discount_percent/100)) STORED,
  line_tax numeric(14,4) GENERATED ALWAYS AS
    (quantity * unit_price * (1 - discount_percent/100) * tax_rate / 100) STORED,
  line_total numeric(14,4) GENERATED ALWAYS AS
    (quantity * unit_price * (1 - discount_percent/100) * (1 + tax_rate/100)) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_lines_order_idx ON public.order_lines(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_lines TO authenticated;
GRANT ALL ON public.order_lines TO service_role;
ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_lines_select" ON public.order_lines FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "order_lines_insert" ON public.order_lines FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id) AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::public.app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::public.app_role)
    )
  );
CREATE POLICY "order_lines_update" ON public.order_lines FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id) AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::public.app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::public.app_role)
    )
  );
CREATE POLICY "order_lines_delete" ON public.order_lines FOR DELETE TO authenticated
  USING (
    public.is_org_member(organization_id) AND (
      public.is_org_admin(organization_id)
      OR public.has_org_role(organization_id, 'sales_director'::public.app_role)
      OR public.has_org_role(organization_id, 'sales_rep'::public.app_role)
    )
  );

-- Trigger para recalcular totais da encomenda
CREATE OR REPLACE FUNCTION public.recalc_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_sub numeric(14,2);
  v_tax numeric(14,2);
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  SELECT
    COALESCE(SUM(line_subtotal), 0)::numeric(14,2),
    COALESCE(SUM(line_tax), 0)::numeric(14,2)
    INTO v_sub, v_tax
  FROM public.order_lines WHERE order_id = v_order_id;

  UPDATE public.orders
     SET subtotal = v_sub,
         tax_total = v_tax,
         total = v_sub + v_tax,
         updated_at = now()
   WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_order_lines_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.order_lines
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_totals();
