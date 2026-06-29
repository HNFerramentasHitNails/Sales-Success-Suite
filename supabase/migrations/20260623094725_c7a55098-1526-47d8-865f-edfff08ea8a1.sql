CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  connector_key text NOT NULL DEFAULT 'generic_webhook_invoicing',
  invoice_number text,
  external_id text,
  pdf_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','issued','error')),
  currency text NOT NULL DEFAULT 'EUR',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  issued_at timestamptz,
  error_message text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_org ON public.invoices(organization_id);
CREATE INDEX idx_invoices_order ON public.invoices(order_id);
CREATE INDEX idx_invoices_status ON public.invoices(organization_id, status);
-- Evitar emissão duplicada: no máximo uma fatura não-erro por encomenda
CREATE UNIQUE INDEX uq_invoices_order_active
  ON public.invoices(order_id)
  WHERE status <> 'error';

GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_members"
  ON public.invoices FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "invoices_delete_admins"
  ON public.invoices FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE TRIGGER trg_invoices_touch
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
