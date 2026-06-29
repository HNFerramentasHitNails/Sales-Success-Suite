
CREATE OR REPLACE FUNCTION public.set_integration_credentials(p_organization_id uuid, p_provider text, p_credentials jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  v_integration_id uuid;
  v_secret_id uuid;
begin
  if not (public.is_org_admin(auth.uid(), p_organization_id) or public.is_platform_admin(auth.uid())) then
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
$function$;

CREATE OR REPLACE FUNCTION public.get_integration_credentials(p_organization_id uuid, p_provider text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  v_secret_id uuid;
  v_decrypted text;
begin
  if not (public.is_org_admin(auth.uid(), p_organization_id) or public.is_platform_admin(auth.uid())) then
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
$function$;

REVOKE ALL ON FUNCTION public.set_integration_credentials(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_integration_credentials(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_integration_credentials(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_integration_credentials(uuid, text) TO authenticated, service_role;
