-- 0) Vault
create extension if not exists supabase_vault with schema vault;

-- 1) Nova coluna
alter table public.integrations
  add column if not exists credentials_secret_id uuid;

-- 2) Recriar a view sem depender da coluna em texto limpo
drop view if exists public.integrations_safe;

-- 3) Migrar + verificar + dropar
do $migrate$
declare
  r record;
  v_secret_id uuid;
  v_decrypted text;
  v_count int := 0;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='integrations' and column_name='credentials'
  ) then
    raise notice 'coluna credentials já foi removida';
    return;
  end if;

  for r in execute
    'select id, credentials from public.integrations
       where credentials is not null
         and credentials::text <> ''{}''
         and credentials_secret_id is null'
  loop
    v_secret_id := vault.create_secret(
      r.credentials::text,
      'integration_credentials_' || r.id::text,
      'Integration credentials for ' || r.id::text
    );

    update public.integrations
       set credentials_secret_id = v_secret_id
     where id = r.id;

    select decrypted_secret into v_decrypted
      from vault.decrypted_secrets where id = v_secret_id;

    if v_decrypted is null or v_decrypted::jsonb <> r.credentials then
      raise exception 'verification_failed_for_integration_%', r.id;
    end if;
    v_count := v_count + 1;
  end loop;

  raise notice 'migradas % linhas para o Vault', v_count;
  alter table public.integrations drop column credentials;
end
$migrate$;

-- 4) Recria a view com a nova fonte de verdade
create view public.integrations_safe as
  select id, organization_id, provider, is_active, sync_direction, config,
         last_sync_at, last_sync_status, created_at, updated_at,
         credentials_secret_id is not null as has_credentials
    from public.integrations;

grant select on public.integrations_safe to authenticated, service_role;

-- 5) RPC: ler credenciais decifradas
create or replace function public.get_integration_credentials(
  p_organization_id uuid,
  p_provider text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_decrypted text;
begin
  if not (public.is_platform_admin() or public.is_org_member(p_organization_id)) then
    raise exception 'forbidden';
  end if;

  select credentials_secret_id into v_secret_id
    from public.integrations
   where organization_id = p_organization_id
     and provider = p_provider
   limit 1;

  if v_secret_id is null then return '{}'::jsonb; end if;

  select decrypted_secret into v_decrypted
    from vault.decrypted_secrets where id = v_secret_id;

  if v_decrypted is null then return '{}'::jsonb; end if;
  return v_decrypted::jsonb;
end;
$$;

revoke all on function public.get_integration_credentials(uuid, text) from public, anon, authenticated;
grant execute on function public.get_integration_credentials(uuid, text) to service_role;

-- 6) RPC: gravar/atualizar credenciais (cifra no Vault)
create or replace function public.set_integration_credentials(
  p_organization_id uuid,
  p_provider text,
  p_credentials jsonb
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_integration_id uuid;
  v_secret_id uuid;
begin
  if not (public.is_platform_admin() or public.is_org_member(p_organization_id)) then
    raise exception 'forbidden';
  end if;

  select id, credentials_secret_id
    into v_integration_id, v_secret_id
    from public.integrations
   where organization_id = p_organization_id
     and provider = p_provider
   limit 1;

  if v_integration_id is null then raise exception 'integration_not_found'; end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_credentials::text,
      'integration_credentials_' || v_integration_id::text,
      'Integration credentials for ' || v_integration_id::text
    );
    update public.integrations
       set credentials_secret_id = v_secret_id
     where id = v_integration_id;
  else
    perform vault.update_secret(v_secret_id, p_credentials::text);
  end if;
end;
$$;

revoke all on function public.set_integration_credentials(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_integration_credentials(uuid, text, jsonb) to service_role;

-- 7) Garante que o Vault não é acessível a roles públicos
revoke all on vault.decrypted_secrets from anon, authenticated, public;
revoke all on vault.secrets from anon, authenticated, public;