-- Os RPCs de credenciais são invocados pelas edge functions via service_role,
-- onde auth.uid() é NULL -> o guard is_platform_admin()/is_org_member() dava
-- sempre 'forbidden'. Fronteira real: EXECUTE só a service_role + authz na edge fn.
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