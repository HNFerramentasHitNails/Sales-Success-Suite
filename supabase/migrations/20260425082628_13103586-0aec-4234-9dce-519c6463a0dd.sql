-- Roles enum
create type public.app_role as enum ('owner','admin','sales_director','sales_agent','viewer');

-- Organizations (tenants)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  primary_color text default '220 50% 23%',
  accent_color text default '43 87% 38%',
  plan text not null default 'trial',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.organizations enable row level security;

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  disc_profile jsonb,
  disc_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Membership
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'sales_agent',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
alter table public.organization_members enable row level security;

-- Security definer helpers (avoid RLS recursion)
create or replace function public.get_user_org(_user_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select organization_id from public.organization_members where user_id = _user_id limit 1
$$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.organization_members where user_id = _user_id and role = _role)
$$;

create or replace function public.is_org_admin(_user_id uuid, _org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where user_id = _user_id and organization_id = _org_id and role in ('owner','admin')
  )
$$;

-- Profiles policies
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_select_same_org" on public.profiles for select to authenticated
  using (exists (
    select 1 from public.organization_members m1
    join public.organization_members m2 on m1.organization_id = m2.organization_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id
  ));
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());

-- Organizations policies
create policy "org_select_member" on public.organizations for select to authenticated
  using (id = public.get_user_org(auth.uid()));
create policy "org_update_admin" on public.organizations for update to authenticated
  using (public.is_org_admin(auth.uid(), id));
create policy "org_insert_authenticated" on public.organizations for insert to authenticated with check (true);

-- Members policies
create policy "members_select_same_org" on public.organization_members for select to authenticated
  using (organization_id = public.get_user_org(auth.uid()));
create policy "members_insert_admin" on public.organization_members for insert to authenticated
  with check (public.is_org_admin(auth.uid(), organization_id) or user_id = auth.uid());
create policy "members_update_admin" on public.organization_members for update to authenticated
  using (public.is_org_admin(auth.uid(), organization_id));
create policy "members_delete_admin" on public.organization_members for delete to authenticated
  using (public.is_org_admin(auth.uid(), organization_id));

-- Trigger: create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_organizations_updated before update on public.organizations
  for each row execute function public.touch_updated_at();
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.touch_updated_at();
