
-- Vouchers
create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  customer_id uuid references public.customers(id) on delete set null,
  voucher_type text not null default 'credito' check (voucher_type in ('credito','desconto')),
  original_value numeric not null default 0,
  current_balance numeric not null default 0,
  status text not null default 'ativo' check (status in ('ativo','resgatado','expirado','cancelado')),
  reason text,
  valid_until date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
grant select, insert, update, delete on public.vouchers to authenticated;
grant all on public.vouchers to service_role;
select public.apply_tenant_rls('public.vouchers');
create trigger vouchers_touch before update on public.vouchers
  for each row execute function public.touch_updated_at();

-- Partners
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  country text,
  email text,
  phone text,
  customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.partners to authenticated;
grant all on public.partners to service_role;
select public.apply_tenant_rls('public.partners');
create trigger partners_touch before update on public.partners
  for each row execute function public.touch_updated_at();

-- Partner annual sales
create table public.partner_annual_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  year int not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, partner_id, year)
);
grant select, insert, update, delete on public.partner_annual_sales to authenticated;
grant all on public.partner_annual_sales to service_role;
select public.apply_tenant_rls('public.partner_annual_sales');
create trigger partner_annual_sales_touch before update on public.partner_annual_sales
  for each row execute function public.touch_updated_at();

-- Partner plaques
create table public.partner_plaques (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  level text not null,
  achieved_at timestamptz not null default now(),
  delivered boolean not null default false,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, partner_id, level)
);
grant select, insert, update, delete on public.partner_plaques to authenticated;
grant all on public.partner_plaques to service_role;
select public.apply_tenant_rls('public.partner_plaques');
create trigger partner_plaques_touch before update on public.partner_plaques
  for each row execute function public.touch_updated_at();
