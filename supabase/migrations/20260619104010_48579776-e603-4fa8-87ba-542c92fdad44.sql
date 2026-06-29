create or replace function public.get_integration_credentials(
  p_organization_id uuid,
  p_provider text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_creds jsonb;
begin
  -- Gate: platform admin OU membro da organização
  if not (public.is_platform_admin() or public.is_org_member(p_organization_id)) then
    raise exception 'forbidden';
  end if;

  select credentials into v_creds
    from public.integrations
   where organization_id = p_organization_id
     and provider = p_provider
   limit 1;

  return coalesce(v_creds, '{}'::jsonb);
end;
$$;

revoke all on function public.get_integration_credentials(uuid, text) from public, anon, authenticated;
grant execute on function public.get_integration_credentials(uuid, text) to service_role;