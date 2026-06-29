create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
      or exists (select 1 from public.organization_members m
                 where m.user_id = auth.uid() and m.organization_id = target_org);
$$;

create or replace function public.auth_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select m.organization_id from public.organization_members m where m.user_id = auth.uid() limit 1;
$$;

create table if not exists public.external_refs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  entity_type text not null,
  internal_id uuid not null,
  external_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_refs_unique unique (organization_id, provider, entity_type, external_id)
);

grant select, insert, update, delete on public.external_refs to authenticated;
grant all on public.external_refs to service_role;

create index if not exists external_refs_lookup_idx on public.external_refs (organization_id, entity_type, internal_id);

create or replace function public.apply_tenant_rls(p_table regclass)
returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security;', p_table);
  execute format('drop policy if exists tenant_isolation on %s;', p_table);
  execute format(
    'create policy tenant_isolation on %s using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));',
    p_table);
end; $$;

select public.apply_tenant_rls('public.external_refs');