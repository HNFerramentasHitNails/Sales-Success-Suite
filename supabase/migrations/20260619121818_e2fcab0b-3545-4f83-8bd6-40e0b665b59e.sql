
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name_raw text,
  sales_rep_id uuid references auth.users(id) on delete set null,
  category text not null default 'Produto',
  status text not null default 'rascunho',
  subtotal numeric not null default 0,
  tax_total numeric not null default 0,
  total numeric not null default 0,
  currency text not null default 'EUR',
  source text not null default 'hub',
  notes text,
  invoice_id uuid references public.invoices(id) on delete set null,
  order_date date not null default (now() at time zone 'utc')::date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number)
);

grant select, insert, update, delete on public.orders to authenticated;
grant all on public.orders to service_role;

select public.apply_tenant_rls('public.orders');

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

create index if not exists orders_org_date_idx on public.orders (organization_id, order_date desc);
create index if not exists orders_org_status_idx on public.orders (organization_id, status);
create index if not exists orders_org_category_idx on public.orders (organization_id, category);
create index if not exists orders_org_customer_idx on public.orders (organization_id, customer_id);
create index if not exists orders_org_rep_idx on public.orders (organization_id, sales_rep_id);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.order_items to authenticated;
grant all on public.order_items to service_role;

select public.apply_tenant_rls('public.order_items');

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_org_idx on public.order_items (organization_id);
