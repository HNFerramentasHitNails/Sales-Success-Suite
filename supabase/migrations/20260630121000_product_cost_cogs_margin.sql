-- Tarefa 6 (brief financeiro) — Custo de produto, COGS, margem e valorização de inventário.
--
-- Sem custo de produto não há COGS nem margem nem inventário valorizado. Adiciona-se:
--  - products.unit_cost: custo atual do produto.
--  - order_lines.unit_cost: snapshot do custo no momento da venda (COGS histórico).
--  - RPCs de margem (período) e de valorização de inventário.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_cost numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS unit_cost numeric(14,2);

-- Snapshot do custo na criação da linha (se a app não fornecer, usa o custo atual do produto).
CREATE OR REPLACE FUNCTION public.trg_order_lines_cost_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.unit_cost IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT unit_cost INTO NEW.unit_cost FROM public.products WHERE id = NEW.product_id;
  END IF;
  NEW.unit_cost := COALESCE(NEW.unit_cost, 0);
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_order_lines_cost ON public.order_lines;
CREATE TRIGGER trg_order_lines_cost
  BEFORE INSERT ON public.order_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_lines_cost_snapshot();

-- Backfill do custo das linhas existentes a partir do custo atual do produto (0 enquanto não houver custos).
UPDATE public.order_lines ol
   SET unit_cost = COALESCE((SELECT p.unit_cost FROM public.products p WHERE p.id = ol.product_id), 0)
 WHERE ol.unit_cost IS NULL;

-- Margem do período: receita líquida (sem IVA) − COGS, sobre encomendas faturadas/pagas.
CREATE OR REPLACE FUNCTION public.get_financial_margins(_org uuid, _from date, _to date)
RETURNS TABLE(revenue numeric, cogs numeric, margin numeric, margin_pct numeric, orders_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'not_a_member'; END IF;

  RETURN QUERY
  WITH lines AS (
    SELECT ol.line_subtotal AS rev,
           COALESCE(ol.unit_cost, 0) * ol.quantity AS cost
      FROM public.orders o
      JOIN public.order_lines ol ON ol.order_id = o.id
     WHERE o.organization_id = _org
       AND o.status IN ('faturada','paga')
       AND o.order_date BETWEEN _from AND _to
  )
  SELECT COALESCE(SUM(rev),0)::numeric AS revenue,
         COALESCE(SUM(cost),0)::numeric AS cogs,
         COALESCE(SUM(rev - cost),0)::numeric AS margin,
         CASE WHEN COALESCE(SUM(rev),0) > 0
              THEN round(COALESCE(SUM(rev - cost),0) / SUM(rev) * 100, 2)
              ELSE 0 END AS margin_pct,
         (SELECT count(DISTINCT o.id) FROM public.orders o
           WHERE o.organization_id = _org AND o.status IN ('faturada','paga')
             AND o.order_date BETWEEN _from AND _to) AS orders_count
    FROM lines;
END
$function$;

-- Margem por produto no período.
CREATE OR REPLACE FUNCTION public.get_margin_by_product(_org uuid, _from date, _to date)
RETURNS TABLE(product_id uuid, product_name text, qty numeric, revenue numeric, cogs numeric, margin numeric, margin_pct numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'not_a_member'; END IF;

  RETURN QUERY
  SELECT ol.product_id,
         COALESCE(p.name, ol.description, '(sem produto)') AS product_name,
         SUM(ol.quantity)::numeric AS qty,
         SUM(ol.line_subtotal)::numeric AS revenue,
         SUM(COALESCE(ol.unit_cost,0) * ol.quantity)::numeric AS cogs,
         SUM(ol.line_subtotal - COALESCE(ol.unit_cost,0) * ol.quantity)::numeric AS margin,
         CASE WHEN SUM(ol.line_subtotal) > 0
              THEN round(SUM(ol.line_subtotal - COALESCE(ol.unit_cost,0)*ol.quantity) / SUM(ol.line_subtotal) * 100, 2)
              ELSE 0 END AS margin_pct
    FROM public.orders o
    JOIN public.order_lines ol ON ol.order_id = o.id
    LEFT JOIN public.products p ON p.id = ol.product_id
   WHERE o.organization_id = _org
     AND o.status IN ('faturada','paga')
     AND o.order_date BETWEEN _from AND _to
   GROUP BY ol.product_id, COALESCE(p.name, ol.description, '(sem produto)')
   ORDER BY margin DESC;
END
$function$;

-- Valorização do inventário ao custo (apenas produtos com controlo de stock).
CREATE OR REPLACE FUNCTION public.get_inventory_valuation(_org uuid)
RETURNS TABLE(total_cost numeric, total_units numeric, products_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'not_a_member'; END IF;

  RETURN QUERY
  SELECT COALESCE(SUM(stock_quantity * COALESCE(unit_cost,0)),0)::numeric AS total_cost,
         COALESCE(SUM(stock_quantity),0)::numeric AS total_units,
         count(*)::bigint AS products_count
    FROM public.products
   WHERE organization_id = _org AND tracks_stock = true AND is_active = true;
END
$function$;

GRANT EXECUTE ON FUNCTION public.get_financial_margins(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_margin_by_product(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_valuation(uuid) TO authenticated;
