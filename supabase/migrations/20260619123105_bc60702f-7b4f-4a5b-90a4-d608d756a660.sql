
create table if not exists public.order_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  issue_type text not null default 'outro',
  description text not null,
  status text not null default 'aberto',
  priority text not null default 'media',
  opened_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.order_issues to authenticated;
grant all on public.order_issues to service_role;

select public.apply_tenant_rls('public.order_issues');

drop trigger if exists order_issues_touch_updated_at on public.order_issues;
create trigger order_issues_touch_updated_at
before update on public.order_issues
for each row execute function public.touch_updated_at();

create index if not exists order_issues_org_status_idx on public.order_issues (organization_id, status);
create index if not exists order_issues_org_order_idx on public.order_issues (organization_id, order_id);

create table if not exists public.rma_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rma_number text not null,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  reason text not null,
  status text not null default 'pedido',
  notes text,
  refund_amount numeric not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, rma_number)
);

grant select, insert, update, delete on public.rma_requests to authenticated;
grant all on public.rma_requests to service_role;

select public.apply_tenant_rls('public.rma_requests');

drop trigger if exists rma_requests_touch_updated_at on public.rma_requests;
create trigger rma_requests_touch_updated_at
before update on public.rma_requests
for each row execute function public.touch_updated_at();

create index if not exists rma_requests_org_status_idx on public.rma_requests (organization_id, status);
create index if not exists rma_requests_org_customer_idx on public.rma_requests (organization_id, customer_id);
