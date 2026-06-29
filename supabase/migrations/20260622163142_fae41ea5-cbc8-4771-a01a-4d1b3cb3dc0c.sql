
-- Unique index for idempotent upsert
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_cards_period
  ON public.commission_cards (organization_id, user_id, period_year, period_month);

-- 1) Monthly commission cards generator
CREATE OR REPLACE FUNCTION public.generate_monthly_commission_cards(p_org uuid, p_year int, p_month int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_card_id uuid;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.is_org_admin(auth.uid(), p_org) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_user IN
    SELECT DISTINCT c.user_id
      FROM public.commissions c
      JOIN public.invoices i ON i.id = c.invoice_id
     WHERE c.organization_id = p_org
       AND i.organization_id = p_org
       AND EXTRACT(YEAR  FROM i.issue_date) = p_year
       AND EXTRACT(MONTH FROM i.issue_date) = p_month
       AND c.user_id IS NOT NULL
  LOOP
    INSERT INTO public.commission_cards (organization_id, user_id, period_year, period_month, status, currency)
    VALUES (p_org, v_user, p_year, p_month, 'rascunho', 'EUR')
    ON CONFLICT (organization_id, user_id, period_year, period_month)
      DO UPDATE SET updated_at = now()
    RETURNING id INTO v_card_id;

    INSERT INTO public.commission_card_items
      (organization_id, card_id, source, invoice_id, commission_id, base_amount, rate_pct, amount, description)
    SELECT p_org, v_card_id, 'invoice', c.invoice_id, c.id,
           COALESCE(c.base_amount, 0),
           CASE WHEN c.rate_type = 'percentage' THEN COALESCE(c.rate_value, 0) ELSE 0 END,
           COALESCE(c.amount, 0),
           'Fatura ' || COALESCE(i.invoice_number, left(c.invoice_id::text, 8))
      FROM public.commissions c
      JOIN public.invoices i ON i.id = c.invoice_id
     WHERE c.organization_id = p_org
       AND c.user_id = v_user
       AND EXTRACT(YEAR  FROM i.issue_date) = p_year
       AND EXTRACT(MONTH FROM i.issue_date) = p_month
       AND NOT EXISTS (
         SELECT 1 FROM public.commission_card_items it
          WHERE it.commission_id = c.id
       );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 2) Cron wrapper for previous month
CREATE OR REPLACE FUNCTION public.cron_generate_monthly_commission_cards()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_y int := EXTRACT(YEAR  FROM v_prev)::int;
  v_m int := EXTRACT(MONTH FROM v_prev)::int;
  v_org uuid;
BEGIN
  FOR v_org IN SELECT id FROM public.organizations LOOP
    PERFORM public.generate_monthly_commission_cards(v_org, v_y, v_m);
  END LOOP;
END;
$$;

-- 3) Adjust recalculate_rfm guard to allow cron (no auth.uid())
CREATE OR REPLACE FUNCTION public.recalculate_rfm(p_org uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_count integer;
begin
  if auth.uid() is not null
     and not public.is_org_admin(auth.uid(), p_org)
     and not public.is_platform_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  with agg as (
    select
      i.customer_id,
      max(i.issue_date) as last_dt,
      count(*)::int     as freq,
      coalesce(sum(i.subtotal), 0)::numeric as monetary
    from public.invoices i
    where i.organization_id = p_org
      and i.customer_id is not null
      and i.status <> 'cancelled'
    group by i.customer_id
  )
  update public.customers c
     set last_purchase_date = a.last_dt,
         purchase_frequency = a.freq,
         monetary           = a.monetary,
         ltv                = a.monetary
    from agg a
   where c.id = a.customer_id
     and c.organization_id = p_org;

  update public.customers
     set purchase_frequency = 0,
         monetary = 0,
         ltv = 0,
         last_purchase_date = null
   where organization_id = p_org
     and id not in (select customer_id from public.invoices
                     where organization_id = p_org and customer_id is not null);

  with base as (
    select id,
           coalesce(last_purchase_date, date '1900-01-01') as last_dt,
           purchase_frequency as f,
           monetary as m
      from public.customers
     where organization_id = p_org
  ),
  scored as (
    select id,
      6 - ntile(5) over (order by (current_date - last_dt) asc) as r_score,
      ntile(5) over (order by f asc) as f_score,
      ntile(5) over (order by m asc) as m_score
    from base
  )
  update public.customers c
     set rfm_r = s.r_score,
         rfm_f = s.f_score,
         rfm_m = s.m_score,
         rfm_updated_at = now()
    from scored s
   where c.id = s.id;

  update public.customers c
     set rfm_segment = case
        when c.purchase_frequency = 0 then 'Perdidos'
        when c.rfm_r >= 4 and ((c.rfm_f + c.rfm_m) / 2.0) >= 4 then 'Campeões'
        when c.rfm_r >= 3 and ((c.rfm_f + c.rfm_m) / 2.0) >= 3 then 'Clientes Fiéis'
        when c.rfm_r >= 4 and ((c.rfm_f + c.rfm_m) / 2.0) <= 2 then 'Fiéis em Potencial'
        when c.rfm_r = 5  and c.rfm_f = 1 then 'Recentes'
        when c.rfm_r = 4  and ((c.rfm_f + c.rfm_m) / 2.0) <= 2 then 'Promissores'
        when c.rfm_r = 3 then 'Precisam Atenção'
        when c.rfm_r <= 2 and ((c.rfm_f + c.rfm_m) / 2.0) >= 3 then 'Em Risco'
        when c.rfm_r <= 2 and ((c.rfm_f + c.rfm_m) / 2.0) = 2 then 'Hibernação'
        else 'Perdidos'
     end
   where c.organization_id = p_org;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

CREATE OR REPLACE FUNCTION public.cron_recalculate_rfm_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  FOR v_org IN SELECT id FROM public.organizations LOOP
    PERFORM public.recalculate_rfm(v_org);
  END LOOP;
END;
$$;

-- 4) Schedule cron jobs (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('monthly-commission-cards');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('rfm-recalc-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('monthly-commission-cards', '0 3 1 * *',
  $$ SELECT public.cron_generate_monthly_commission_cards(); $$);

SELECT cron.schedule('rfm-recalc-daily', '0 4 * * *',
  $$ SELECT public.cron_recalculate_rfm_all(); $$);
