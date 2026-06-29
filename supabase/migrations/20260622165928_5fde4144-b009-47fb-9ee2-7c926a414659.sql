drop trigger if exists trg_seed_default_organization_modules on public.organizations;
drop function if exists public.seed_default_organization_modules() cascade;
drop table if exists public.organization_modules cascade;
drop table if exists public.access_group_modules cascade;