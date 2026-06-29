CREATE OR REPLACE FUNCTION public.get_dashboard_summary(_org_id uuid, _from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_faturado numeric := 0;
  v_vendas numeric := 0;
  v_vendas_sem_iva numeric := 0;
  v_por_faturar numeric := 0;
  v_por_faturar_sem_iva numeric := 0;
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

  SELECT COALESCE(SUM(total),0), COALESCE(SUM(subtotal),0), COUNT(*), COUNT(DISTINCT customer_id)
    INTO v_vendas, v_vendas_sem_iva, v_num_orders, v_clientes
    FROM public.orders
   WHERE organization_id = _org_id
     AND status <> 'cancelada'
     AND order_date BETWEEN _from AND _to;

  IF v_num_orders > 0 THEN
    v_ticket := v_vendas / v_num_orders;
  END IF;

  SELECT COALESCE(SUM(o.total),0), COALESCE(SUM(o.subtotal),0)
    INTO v_por_faturar, v_por_faturar_sem_iva
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
    'vendas_sem_iva', v_vendas_sem_iva,
    'por_faturar', v_por_faturar,
    'por_faturar_sem_iva', v_por_faturar_sem_iva,
    'num_orders', v_num_orders,
    'ticket_medio', v_ticket,
    'clientes_ativos', v_clientes,
    'pipeline_aberto', v_pipeline,
    'taxa_conversao', v_conv
  );
END;
$function$;