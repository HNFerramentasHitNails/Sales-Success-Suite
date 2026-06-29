
-- 1) Resumo geral
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  _org_id uuid, _from date, _to date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_faturado numeric := 0;
  v_vendas numeric := 0;
  v_por_faturar numeric := 0;
  v_num_orders integer := 0;
  v_ticket numeric := 0;
  v_clientes integer := 0;
  v_pipeline numeric := 0;
  v_ganhos integer := 0;
  v_perdidos integer := 0;
  v_conv numeric := 0;
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  SELECT COALESCE(SUM(total),0) INTO v_faturado
    FROM public.invoices
   WHERE organization_id = _org_id
     AND status = 'issued'
     AND issued_at::date BETWEEN _from AND _to;

  SELECT COALESCE(SUM(total),0), COUNT(*), COUNT(DISTINCT customer_id)
    INTO v_vendas, v_num_orders, v_clientes
    FROM public.orders
   WHERE organization_id = _org_id
     AND status <> 'cancelada'
     AND order_date BETWEEN _from AND _to;

  IF v_num_orders > 0 THEN
    v_ticket := v_vendas / v_num_orders;
  END IF;

  SELECT COALESCE(SUM(o.total),0) INTO v_por_faturar
    FROM public.orders o
    LEFT JOIN public.invoices i
      ON i.order_id = o.id AND i.status <> 'error'
   WHERE o.organization_id = _org_id
     AND o.status IN ('confirmada','paga')
     AND i.id IS NULL;

  SELECT COALESCE(SUM(estimated_value),0) INTO v_pipeline
    FROM public.prospects
   WHERE organization_id = _org_id
     AND pipeline_stage NOT IN ('ganho','perdido');

  SELECT
    COUNT(*) FILTER (WHERE pipeline_stage = 'ganho'),
    COUNT(*) FILTER (WHERE pipeline_stage = 'perdido')
    INTO v_ganhos, v_perdidos
    FROM public.prospects
   WHERE organization_id = _org_id;

  IF (v_ganhos + v_perdidos) > 0 THEN
    v_conv := v_ganhos::numeric / (v_ganhos + v_perdidos);
  END IF;

  RETURN jsonb_build_object(
    'faturado', v_faturado,
    'vendas', v_vendas,
    'por_faturar', v_por_faturar,
    'num_orders', v_num_orders,
    'ticket_medio', v_ticket,
    'clientes_ativos', v_clientes,
    'pipeline_aberto', v_pipeline,
    'taxa_conversao', v_conv
  );
END;
$$;

-- 2) Evolução por mês
CREATE OR REPLACE FUNCTION public.get_sales_evolution(
  _org_id uuid, _months integer
) RETURNS TABLE(month_start date, faturado numeric, vendas numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT (date_trunc('month', now())::date - (gs || ' months')::interval)::date AS month_start
      FROM generate_series(0, GREATEST(_months,1) - 1) AS gs
  ),
  fat AS (
    SELECT date_trunc('month', issued_at)::date AS m, SUM(total) AS s
      FROM public.invoices
     WHERE organization_id = _org_id
       AND status = 'issued'
       AND issued_at >= (date_trunc('month', now()) - ((_months - 1) || ' months')::interval)
     GROUP BY 1
  ),
  ven AS (
    SELECT date_trunc('month', order_date)::date AS m, SUM(total) AS s
      FROM public.orders
     WHERE organization_id = _org_id
       AND status <> 'cancelada'
       AND order_date >= (date_trunc('month', now()) - ((_months - 1) || ' months')::interval)::date
     GROUP BY 1
  )
  SELECT m.month_start,
         COALESCE(fat.s, 0)::numeric AS faturado,
         COALESCE(ven.s, 0)::numeric AS vendas
    FROM months m
    LEFT JOIN fat ON fat.m = m.month_start
    LEFT JOIN ven ON ven.m = m.month_start
   ORDER BY m.month_start;
END;
$$;

-- 3) Top clientes
CREATE OR REPLACE FUNCTION public.get_top_customers(
  _org_id uuid, _from date, _to date, _limit integer DEFAULT 10
) RETURNS TABLE(customer_id uuid, customer_name text, total numeric, num_orders integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  RETURN QUERY
  SELECT o.customer_id,
         COALESCE(c.name, '—') AS customer_name,
         SUM(o.total)::numeric AS total,
         COUNT(*)::int AS num_orders
    FROM public.orders o
    LEFT JOIN public.customers c ON c.id = o.customer_id
   WHERE o.organization_id = _org_id
     AND o.status <> 'cancelada'
     AND o.order_date BETWEEN _from AND _to
   GROUP BY o.customer_id, c.name
   ORDER BY total DESC
   LIMIT GREATEST(_limit, 1);
END;
$$;

-- 4) Top produtos com Pareto/ABC
CREATE OR REPLACE FUNCTION public.get_top_products(
  _org_id uuid, _from date, _to date, _limit integer DEFAULT 20
) RETURNS TABLE(
  product_id uuid,
  product_name text,
  quantity numeric,
  revenue numeric,
  pct numeric,
  cumulative_pct numeric,
  abc_class text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT ol.product_id,
           COALESCE(p.name, ol.description, '—') AS product_name,
           SUM(ol.quantity)::numeric AS quantity,
           SUM(ol.line_total)::numeric AS revenue
      FROM public.order_lines ol
      JOIN public.orders o ON o.id = ol.order_id
      LEFT JOIN public.products p ON p.id = ol.product_id
     WHERE o.organization_id = _org_id
       AND o.status <> 'cancelada'
       AND o.order_date BETWEEN _from AND _to
     GROUP BY ol.product_id, COALESCE(p.name, ol.description, '—')
  ),
  tot AS (SELECT NULLIF(SUM(revenue),0) AS t FROM agg),
  ranked AS (
    SELECT a.*,
           ROW_NUMBER() OVER (ORDER BY a.revenue DESC) AS rn,
           CASE WHEN tot.t IS NULL THEN 0
                ELSE a.revenue / tot.t END AS pct,
           CASE WHEN tot.t IS NULL THEN 0
                ELSE SUM(a.revenue) OVER (ORDER BY a.revenue DESC
                                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) / tot.t
           END AS cumulative_pct
      FROM agg a CROSS JOIN tot
  )
  SELECT product_id,
         product_name,
         quantity,
         revenue,
         pct,
         cumulative_pct,
         CASE WHEN cumulative_pct <= 0.80 THEN 'A'
              WHEN cumulative_pct <= 0.95 THEN 'B'
              ELSE 'C' END AS abc_class
    FROM ranked
   ORDER BY revenue DESC
   LIMIT GREATEST(_limit, 1);
END;
$$;

-- 5) Ranking da equipa
CREATE OR REPLACE FUNCTION public.get_team_ranking(
  _org_id uuid, _from date, _to date
) RETURNS TABLE(member_id uuid, member_name text, member_email text, total numeric, num_orders integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
  IF NOT (public.is_org_admin(_org_id)
          OR public.has_org_role(_org_id, 'sales_director'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT o.assigned_member_id AS member_id,
         COALESCE(pr.full_name, pr.email, '—') AS member_name,
         pr.email AS member_email,
         SUM(o.total)::numeric AS total,
         COUNT(*)::int AS num_orders
    FROM public.orders o
    LEFT JOIN public.profiles pr ON pr.id = o.assigned_member_id
   WHERE o.organization_id = _org_id
     AND o.status <> 'cancelada'
     AND o.order_date BETWEEN _from AND _to
   GROUP BY o.assigned_member_id, pr.full_name, pr.email
   ORDER BY total DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(uuid,date,date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_sales_evolution(uuid,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_top_customers(uuid,date,date,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_top_products(uuid,date,date,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_ranking(uuid,date,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_evolution(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_customers(uuid,date,date,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_products(uuid,date,date,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_ranking(uuid,date,date) TO authenticated;
