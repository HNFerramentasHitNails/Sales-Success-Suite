
-- 1) Colunas materializadas em customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS last_purchase_at date,
  ADD COLUMN IF NOT EXISTS last_purchase_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_spent numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orders_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_recurrence_days integer,
  ADD COLUMN IF NOT EXISTS next_purchase_expected_at date,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contact_outcome text;

CREATE INDEX IF NOT EXISTS customers_org_next_purchase_idx
  ON public.customers (organization_id, next_purchase_expected_at);
CREATE INDEX IF NOT EXISTS customers_org_last_purchase_idx
  ON public.customers (organization_id, last_purchase_at DESC);

-- 2) Função de recálculo (idempotente)
CREATE OR REPLACE FUNCTION public.recompute_customer_metrics(_org_id uuid, _customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(14,2) := 0;
  v_count integer := 0;
  v_last_date date;
  v_last_value numeric(14,2);
  v_avg integer;
  v_next date;
  v_contact_at timestamptz;
  v_contact_outcome text;
BEGIN
  IF _customer_id IS NULL THEN RETURN; END IF;

  -- Encomendas válidas (paga/faturada)
  SELECT COALESCE(SUM(o.subtotal),0)::numeric(14,2),
         COUNT(*)::int
    INTO v_total, v_count
    FROM public.orders o
   WHERE o.organization_id = _org_id
     AND o.customer_id = _customer_id
     AND o.status IN ('paga','faturada');

  SELECT o.order_date, o.subtotal
    INTO v_last_date, v_last_value
    FROM public.orders o
   WHERE o.organization_id = _org_id
     AND o.customer_id = _customer_id
     AND o.status IN ('paga','faturada')
   ORDER BY o.order_date DESC NULLS LAST, o.created_at DESC
   LIMIT 1;

  -- Recorrência média (precisa de pelo menos 2 encomendas)
  IF v_count >= 2 THEN
    WITH dates AS (
      SELECT o.order_date
        FROM public.orders o
       WHERE o.organization_id = _org_id
         AND o.customer_id = _customer_id
         AND o.status IN ('paga','faturada')
         AND o.order_date IS NOT NULL
       ORDER BY o.order_date ASC
    ), diffs AS (
      SELECT (order_date - LAG(order_date) OVER (ORDER BY order_date))::int AS d
        FROM dates
    )
    SELECT NULLIF(AVG(d), 0)::int INTO v_avg FROM diffs WHERE d IS NOT NULL AND d > 0;
  ELSE
    v_avg := NULL;
  END IF;

  IF v_last_date IS NOT NULL AND v_avg IS NOT NULL THEN
    v_next := v_last_date + v_avg;
  ELSE
    v_next := NULL;
  END IF;

  -- Último contacto (chamada concluída)
  SELECT sc.scheduled_for, sc.outcome
    INTO v_contact_at, v_contact_outcome
    FROM public.sales_calls sc
   WHERE sc.organization_id = _org_id
     AND sc.customer_id = _customer_id
     AND sc.status = 'completed'
   ORDER BY sc.scheduled_for DESC NULLS LAST, sc.updated_at DESC
   LIMIT 1;

  UPDATE public.customers
     SET total_spent = v_total,
         orders_count = v_count,
         last_purchase_at = v_last_date,
         last_purchase_value = v_last_value,
         avg_recurrence_days = v_avg,
         next_purchase_expected_at = v_next,
         last_contact_at = v_contact_at,
         last_contact_outcome = v_contact_outcome,
         updated_at = now()
   WHERE id = _customer_id
     AND organization_id = _org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_customer_metrics(uuid, uuid) TO authenticated, service_role;

-- 3) Trigger em orders
CREATE OR REPLACE FUNCTION public.trg_orders_recompute_customer_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.customer_id IS NOT NULL THEN
      PERFORM public.recompute_customer_metrics(OLD.organization_id, OLD.customer_id);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.customer_id IS NOT NULL THEN
      PERFORM public.recompute_customer_metrics(NEW.organization_id, NEW.customer_id);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    IF OLD.customer_id IS NOT NULL THEN
      PERFORM public.recompute_customer_metrics(OLD.organization_id, OLD.customer_id);
    END IF;
    IF NEW.customer_id IS NOT NULL THEN
      PERFORM public.recompute_customer_metrics(NEW.organization_id, NEW.customer_id);
    END IF;
  ELSIF NEW.customer_id IS NOT NULL AND (
        NEW.status IS DISTINCT FROM OLD.status
     OR NEW.order_date IS DISTINCT FROM OLD.order_date
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
  ) THEN
    PERFORM public.recompute_customer_metrics(NEW.organization_id, NEW.customer_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_recompute_customer_metrics ON public.orders;
CREATE TRIGGER orders_recompute_customer_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_recompute_customer_metrics();

-- 4) Trigger em sales_calls
CREATE OR REPLACE FUNCTION public.trg_calls_recompute_customer_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.customer_id IS NOT NULL AND OLD.status = 'completed' THEN
      PERFORM public.recompute_customer_metrics(OLD.organization_id, OLD.customer_id);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.customer_id IS NOT NULL AND NEW.status = 'completed' THEN
      PERFORM public.recompute_customer_metrics(NEW.organization_id, NEW.customer_id);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    IF OLD.customer_id IS NOT NULL THEN
      PERFORM public.recompute_customer_metrics(OLD.organization_id, OLD.customer_id);
    END IF;
    IF NEW.customer_id IS NOT NULL THEN
      PERFORM public.recompute_customer_metrics(NEW.organization_id, NEW.customer_id);
    END IF;
  ELSIF NEW.customer_id IS NOT NULL AND (
        NEW.status IS DISTINCT FROM OLD.status
     OR NEW.outcome IS DISTINCT FROM OLD.outcome
     OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for
  ) THEN
    PERFORM public.recompute_customer_metrics(NEW.organization_id, NEW.customer_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_calls_recompute_customer_metrics ON public.sales_calls;
CREATE TRIGGER sales_calls_recompute_customer_metrics
AFTER INSERT OR UPDATE OR DELETE ON public.sales_calls
FOR EACH ROW EXECUTE FUNCTION public.trg_calls_recompute_customer_metrics();

-- 5) Backfill — popular métricas existentes
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, organization_id FROM public.customers LOOP
    PERFORM public.recompute_customer_metrics(r.organization_id, r.id);
  END LOOP;
END $$;
