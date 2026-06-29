
alter table public.customers
  add column if not exists last_purchase_date date,
  add column if not exists purchase_frequency integer not null default 0,
  add column if not exists monetary numeric not null default 0,
  add column if not exists ltv numeric not null default 0,
  add column if not exists rfm_r smallint,
  add column if not exists rfm_f smallint,
  add column if not exists rfm_m smallint,
  add column if not exists rfm_segment text,
  add column if not exists rfm_updated_at timestamptz,
  add column if not exists recurrence_interval_days integer,
  add column if not exists payment_status text;

alter table public.calls
  add column if not exists sale_value numeric not null default 0;

create index if not exists customers_org_segment_idx on public.customers (organization_id, rfm_segment);
create index if not exists customers_org_last_purchase_idx on public.customers (organization_id, last_purchase_date);

create or replace function public.recalculate_rfm(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_org_admin(auth.uid(), p_org)
     and not public.is_platform_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  -- 1) Recompute aggregates from invoices (status not cancelled)
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

  -- Reset stats for customers without invoices
  update public.customers
     set purchase_frequency = 0,
         monetary = 0,
         ltv = 0,
         last_purchase_date = null
   where organization_id = p_org
     and id not in (select customer_id from public.invoices
                     where organization_id = p_org and customer_id is not null);

  -- 2) Compute RFM scores via ntile(5) within the org
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
      -- Recency: more recent => higher score. ntile on days-since-last (asc) => 1 best, so invert.
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

  -- 3) Assign segment (simple 9-segment model based on R and F+M average)
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

revoke execute on function public.recalculate_rfm(uuid) from public, anon;
grant execute on function public.recalculate_rfm(uuid) to authenticated;
