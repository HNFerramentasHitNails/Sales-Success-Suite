
-- get_top_products: usa nomes internos r_* para evitar colisão com OUT cols
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
    SELECT ol.product_id              AS r_product_id,
           COALESCE(p.name, ol.description, '—') AS r_product_name,
           SUM(ol.quantity)::numeric  AS r_quantity,
           SUM(ol.line_total)::numeric AS r_revenue
      FROM public.order_lines ol
      JOIN public.orders o ON o.id = ol.order_id
      LEFT JOIN public.products p ON p.id = ol.product_id
     WHERE o.organization_id = _org_id
       AND o.status <> 'cancelada'
       AND o.order_date BETWEEN _from AND _to
     GROUP BY ol.product_id, COALESCE(p.name, ol.description, '—')
  ),
  tot AS (SELECT NULLIF(SUM(agg.r_revenue), 0) AS r_total FROM agg),
  ranked AS (
    SELECT agg.r_product_id,
           agg.r_product_name,
           agg.r_quantity,
           agg.r_revenue,
           CASE WHEN tot.r_total IS NULL THEN 0
                ELSE agg.r_revenue / tot.r_total END AS r_pct,
           CASE WHEN tot.r_total IS NULL THEN 0
                ELSE SUM(agg.r_revenue) OVER (
                       ORDER BY agg.r_revenue DESC
                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                     ) / tot.r_total
           END AS r_cum
      FROM agg CROSS JOIN tot
  )
  SELECT ranked.r_product_id,
         ranked.r_product_name,
         ranked.r_quantity,
         ranked.r_revenue,
         ranked.r_pct,
         ranked.r_cum,
         CASE WHEN ranked.r_cum <= 0.80 THEN 'A'
              WHEN ranked.r_cum <= 0.95 THEN 'B'
              ELSE 'C' END
    FROM ranked
   ORDER BY ranked.r_revenue DESC
   LIMIT GREATEST(_limit, 1);
END;
$$;

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
  WITH agg AS (
    SELECT o.customer_id               AS r_customer_id,
           COALESCE(c.name, '—')       AS r_customer_name,
           SUM(o.total)::numeric       AS r_total,
           COUNT(*)::int               AS r_num_orders
      FROM public.orders o
      LEFT JOIN public.customers c ON c.id = o.customer_id
     WHERE o.organization_id = _org_id
       AND o.status <> 'cancelada'
       AND o.order_date BETWEEN _from AND _to
     GROUP BY o.customer_id, c.name
  )
  SELECT agg.r_customer_id, agg.r_customer_name, agg.r_total, agg.r_num_orders
    FROM agg
   ORDER BY agg.r_total DESC
   LIMIT GREATEST(_limit, 1);
END;
$$;

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
  WITH agg AS (
    SELECT o.assigned_member_id               AS r_member_id,
           COALESCE(pr.full_name, pr.email, '—') AS r_member_name,
           pr.email                            AS r_member_email,
           SUM(o.total)::numeric               AS r_total,
           COUNT(*)::int                       AS r_num_orders
      FROM public.orders o
      LEFT JOIN public.profiles pr ON pr.id = o.assigned_member_id
     WHERE o.organization_id = _org_id
       AND o.status <> 'cancelada'
       AND o.order_date BETWEEN _from AND _to
     GROUP BY o.assigned_member_id, pr.full_name, pr.email
  )
  SELECT agg.r_member_id, agg.r_member_name, agg.r_member_email, agg.r_total, agg.r_num_orders
    FROM agg
   ORDER BY agg.r_total DESC;
END;
$$;

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
    SELECT (date_trunc('month', now())::date - (gs || ' months')::interval)::date AS r_month
      FROM generate_series(0, GREATEST(_months,1) - 1) AS gs
  ),
  fat AS (
    SELECT date_trunc('month', i.issued_at)::date AS r_month, SUM(i.total) AS r_sum
      FROM public.invoices i
     WHERE i.organization_id = _org_id
       AND i.status = 'issued'
       AND i.issued_at >= (date_trunc('month', now()) - ((_months - 1) || ' months')::interval)
     GROUP BY 1
  ),
  ven AS (
    SELECT date_trunc('month', o.order_date)::date AS r_month, SUM(o.total) AS r_sum
      FROM public.orders o
     WHERE o.organization_id = _org_id
       AND o.status <> 'cancelada'
       AND o.order_date >= (date_trunc('month', now()) - ((_months - 1) || ' months')::interval)::date
     GROUP BY 1
  )
  SELECT m.r_month,
         COALESCE(fat.r_sum, 0)::numeric,
         COALESCE(ven.r_sum, 0)::numeric
    FROM months m
    LEFT JOIN fat ON fat.r_month = m.r_month
    LEFT JOIN ven ON ven.r_month = m.r_month
   ORDER BY m.r_month;
END;
$$;
