-- Tarefa 4 (brief financeiro) — Geração automática de comissões.
--
-- generate_commission_statements já existe (idempotente, incorpora commission_adjustments,
-- logo apanha as reversões de devolução da Tarefa 2) mas é manual e exige admin.
-- Aqui: variante de sistema (sem gate de auth) + trigger que gera ao faturar/pagar
-- (período = mês da encomenda) + backfill das encomendas já faturadas.

CREATE OR REPLACE FUNCTION public.generate_commission_statements_system(_org_id uuid, _from date, _to date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  WITH eligible_rules AS (
    SELECT cr.id, cr.applies_to, cr.product_id, cr.category,
           cr.member_id, cr.priority, cr.created_at, cr.rate_percent,
           CASE cr.applies_to
             WHEN 'product'  THEN 4
             WHEN 'category' THEN 3
             WHEN 'member'   THEN 2
             ELSE 1 END AS r_spec
      FROM public.commission_rules cr
     WHERE cr.organization_id = _org_id
       AND cr.is_active = true
  ),
  lines AS (
    SELECT ol.id AS r_line_id,
           ol.line_subtotal AS r_base,
           o.assigned_member_id AS r_member_id,
           ol.product_id AS r_product_id,
           p.category AS r_category
      FROM public.order_lines ol
      JOIN public.orders o ON o.id = ol.order_id
      LEFT JOIN public.products p ON p.id = ol.product_id
     WHERE o.organization_id = _org_id
       AND o.status IN ('paga','faturada')
       AND o.order_date BETWEEN _from AND _to
       AND o.assigned_member_id IS NOT NULL
  ),
  line_with_rule AS (
    SELECT l.r_member_id, l.r_base,
           (SELECT er.rate_percent
              FROM eligible_rules er
             WHERE (er.applies_to = 'all')
                OR (er.applies_to = 'product'  AND er.product_id = l.r_product_id)
                OR (er.applies_to = 'category' AND er.category IS NOT NULL AND er.category = l.r_category)
                OR (er.applies_to = 'member'   AND er.member_id IS NOT NULL AND er.member_id = l.r_member_id)
             ORDER BY er.r_spec DESC, er.priority DESC, er.created_at DESC
             LIMIT 1) AS r_rate
      FROM lines l
  ),
  order_agg AS (
    SELECT r_member_id AS m_id,
           SUM(r_base)::numeric(14,2) AS base_total,
           SUM(r_base * COALESCE(r_rate,0) / 100.0)::numeric(14,2) AS order_commission
      FROM line_with_rule
     GROUP BY r_member_id
  ),
  adj_agg AS (
    SELECT ca.member_id AS m_id,
           SUM(ca.amount)::numeric(14,2) AS adj_total
      FROM public.commission_adjustments ca
     WHERE ca.organization_id = _org_id
       AND ca.period_start = _from
       AND ca.period_end = _to
     GROUP BY ca.member_id
  ),
  agg AS (
    SELECT COALESCE(o.m_id, a.m_id) AS r_member_id,
           COALESCE(o.base_total, 0)::numeric(14,2) AS base_total,
           (COALESCE(o.order_commission, 0) + COALESCE(a.adj_total, 0))::numeric(14,2) AS commission_total
      FROM order_agg o
      FULL OUTER JOIN adj_agg a ON a.m_id = o.m_id
     WHERE COALESCE(o.m_id, a.m_id) IS NOT NULL
       AND (COALESCE(o.order_commission, 0) + COALESCE(a.adj_total, 0)) <> 0
  )
  INSERT INTO public.commission_statements AS cs
    (organization_id, member_id, period_start, period_end,
     base_total, commission_total, status, generated_at, generated_by)
  SELECT _org_id, a.r_member_id, _from, _to,
         a.base_total, a.commission_total, 'pendente', now(), NULL
    FROM agg a
  ON CONFLICT (organization_id, member_id, period_start, period_end)
  DO UPDATE SET
     base_total = CASE WHEN cs.status = 'paga' THEN cs.base_total ELSE EXCLUDED.base_total END,
     commission_total = CASE WHEN cs.status = 'paga' THEN cs.commission_total ELSE EXCLUDED.commission_total END,
     generated_at = CASE WHEN cs.status = 'paga' THEN cs.generated_at ELSE now() END;
END
$function$;

-- Gera/atualiza o mapa de comissões do mês quando a encomenda é paga/faturada.
CREATE OR REPLACE FUNCTION public.trg_orders_commissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_from date; v_to date;
BEGIN
  IF NEW.status IN ('paga','faturada') AND NEW.assigned_member_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    v_from := date_trunc('month', NEW.order_date)::date;
    v_to   := (date_trunc('month', NEW.order_date) + interval '1 month - 1 day')::date;
    PERFORM public.generate_commission_statements_system(NEW.organization_id, v_from, v_to);
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_orders_commissions ON public.orders;
CREATE TRIGGER trg_orders_commissions
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_commissions();

-- Backfill: gera as comissões em falta das encomendas já faturadas/pagas (por mês).
DO $backfill$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT organization_id,
           date_trunc('month', order_date)::date AS mfrom,
           (date_trunc('month', order_date) + interval '1 month - 1 day')::date AS mto
      FROM public.orders
     WHERE status IN ('paga','faturada') AND assigned_member_id IS NOT NULL
  LOOP
    PERFORM public.generate_commission_statements_system(r.organization_id, r.mfrom, r.mto);
  END LOOP;
END
$backfill$;
