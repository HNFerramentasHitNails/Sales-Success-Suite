drop function if exists public._test_rls_isolation();
drop function if exists public._test_rls_check_as(uuid, text, uuid, uuid, uuid, text, boolean);

-- Temporarily grant CREATE on public to 'authenticated' so we can transfer ownership of the helper.
grant create on schema public to authenticated;

create or replace function public._test_rls_check_as(
  p_user uuid, p_email text, p_org_self uuid, p_org_other uuid,
  p_cust_other uuid, p_tag text, p_test_mutations boolean
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_n integer;
  v_did boolean;
  v_label text := p_tag;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'email', p_email)::text, true);

  select count(*) into v_n from public.customers where organization_id = p_org_other;
  if v_n <> 0 then raise exception 'RLS_FAIL: % sees customers of other org (%)', v_label, v_n; end if;
  select count(*) into v_n from public.customers where organization_id = p_org_self;
  if v_n < 1 then raise exception 'RLS_FAIL: % cannot see own customers', v_label; end if;

  select count(*) into v_n from public.invoices where organization_id = p_org_other;
  if v_n <> 0 then raise exception 'RLS_FAIL: % sees invoices of other org', v_label; end if;
  select count(*) into v_n from public.invoices where organization_id = p_org_self;
  if v_n < 1 then raise exception 'RLS_FAIL: % cannot see own invoices', v_label; end if;

  select count(*) into v_n from public.invoice_items where organization_id = p_org_other;
  if v_n <> 0 then raise exception 'RLS_FAIL: % sees invoice_items of other org', v_label; end if;

  select count(*) into v_n from public.prospects where organization_id = p_org_other;
  if v_n <> 0 then raise exception 'RLS_FAIL: % sees prospects of other org', v_label; end if;

  if p_test_mutations then
    v_did := false;
    begin
      insert into public.customers (organization_id, name) values (p_org_other, p_tag||'_leak_cust');
      v_did := true;
    exception when insufficient_privilege then null;
             when others then if SQLSTATE = '42501' then null; else raise; end if;
    end;
    if v_did then raise exception 'RLS_FAIL: % inserted customer into other org', v_label; end if;

    v_did := false;
    begin
      insert into public.invoices (organization_id, invoice_number, issue_date)
        values (p_org_other, p_tag||'-LEAK', current_date);
      v_did := true;
    exception when insufficient_privilege then null;
             when others then if SQLSTATE = '42501' then null; else raise; end if;
    end;
    if v_did then raise exception 'RLS_FAIL: % inserted invoice into other org', v_label; end if;

    update public.customers set name = name || '_hacked' where id = p_cust_other;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'RLS_FAIL: % updated % rows in other org customers', v_label, v_n; end if;

    delete from public.customers where id = p_cust_other;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'RLS_FAIL: % deleted % rows in other org customers', v_label, v_n; end if;
  end if;
end;
$fn$;

alter function public._test_rls_check_as(uuid, text, uuid, uuid, uuid, text, boolean) owner to authenticated;

-- Revoke the temporary CREATE grant immediately.
revoke create on schema public from authenticated;

revoke all on function public._test_rls_check_as(uuid, text, uuid, uuid, uuid, text, boolean) from public, anon;
grant execute on function public._test_rls_check_as(uuid, text, uuid, uuid, uuid, text, boolean) to postgres, service_role, sandbox_exec, authenticated;

create or replace function public._test_rls_isolation()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_inv_a uuid := gen_random_uuid();
  v_inv_b uuid := gen_random_uuid();
  v_cust_b uuid;
  v_cust_a uuid;
  v_tag text := 'rls_test_' || substr(replace(gen_random_uuid()::text,'-',''),1,12);
begin
  begin
    insert into auth.users (id, email, raw_user_meta_data) values
      (v_user_a, v_tag||'_a@test.local', jsonb_build_object('full_name', v_tag||' A')),
      (v_user_b, v_tag||'_b@test.local', jsonb_build_object('full_name', v_tag||' B'));

    insert into public.organizations (id, name, slug, plan, status) values
      (v_org_a, v_tag||'_A', v_tag||'-a', 'free', 'active'),
      (v_org_b, v_tag||'_B', v_tag||'-b', 'free', 'active');

    insert into public.organization_members (organization_id, user_id, role) values
      (v_org_a, v_user_a, 'owner'),
      (v_org_b, v_user_b, 'owner');

    insert into public.customers (organization_id, name) values
      (v_org_a, v_tag||'_cust_A1'),
      (v_org_a, v_tag||'_cust_A2'),
      (v_org_b, v_tag||'_cust_B1');
    select id into v_cust_b from public.customers where organization_id = v_org_b and name = v_tag||'_cust_B1';
    select id into v_cust_a from public.customers where organization_id = v_org_a and name = v_tag||'_cust_A1';

    insert into public.invoices (id, organization_id, invoice_number, issue_date) values
      (v_inv_a, v_org_a, v_tag||'-INV-A1', current_date),
      (v_inv_b, v_org_b, v_tag||'-INV-B1', current_date);

    insert into public.invoice_items (organization_id, invoice_id, product_name_raw) values
      (v_org_a, v_inv_a, v_tag||'_item_A'),
      (v_org_b, v_inv_b, v_tag||'_item_B');

    insert into public.prospects (organization_id, name) values
      (v_org_a, v_tag||'_prosp_A'),
      (v_org_b, v_tag||'_prosp_B');

    perform public._test_rls_check_as(v_user_a, v_tag||'_a@test.local', v_org_a, v_org_b, v_cust_b, v_tag||':userA', true);
    perform public._test_rls_check_as(v_user_b, v_tag||'_b@test.local', v_org_b, v_org_a, v_cust_a, v_tag||':userB', true);

    raise exception 'ROLLBACK_SENTINEL';
  exception
    when others then
      if SQLERRM = 'ROLLBACK_SENTINEL' then
        return 'RLS_ISOLATION_OK';
      elsif SQLERRM like 'RLS_FAIL:%' then
        raise;
      else
        raise exception 'RLS_TEST_SETUP_ERROR: % (SQLSTATE=%)', SQLERRM, SQLSTATE;
      end if;
  end;
end;
$fn$;

revoke all on function public._test_rls_isolation() from public, anon, authenticated;
grant execute on function public._test_rls_isolation() to postgres, service_role, sandbox_exec;