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
  v_cust_b uuid := gen_random_uuid();
  v_n integer;
  v_did boolean;
  v_tag text := 'rls_test_' || substr(replace(gen_random_uuid()::text,'-',''),1,12);
begin
  begin
    -- ===== SEED (as definer/postgres, bypasses RLS) =====
    insert into auth.users (id, email, raw_user_meta_data)
      values (v_user_a, v_tag||'_a@test.local', jsonb_build_object('full_name', v_tag||' A')),
             (v_user_b, v_tag||'_b@test.local', jsonb_build_object('full_name', v_tag||' B'));

    insert into public.organizations (id, name, slug, plan, status)
      values (v_org_a, v_tag||'_A', v_tag||'-a', 'free', 'active'),
             (v_org_b, v_tag||'_B', v_tag||'-b', 'free', 'active');

    insert into public.organization_members (organization_id, user_id, role) values
      (v_org_a, v_user_a, 'owner'),
      (v_org_b, v_user_b, 'owner');

    -- customers
    insert into public.customers (organization_id, name) values
      (v_org_a, v_tag||'_cust_A1'),
      (v_org_a, v_tag||'_cust_A2'),
      (v_org_b, v_tag||'_cust_B1');
    -- capture one B customer id for later update/delete attempts
    select id into v_cust_b from public.customers
      where organization_id = v_org_b and name = v_tag||'_cust_B1';

    -- invoices
    insert into public.invoices (id, organization_id, invoice_number, issue_date) values
      (v_inv_a, v_org_a, v_tag||'-INV-A1', current_date),
      (v_inv_b, v_org_b, v_tag||'-INV-B1', current_date);

    -- invoice_items (FK to invoices)
    insert into public.invoice_items (organization_id, invoice_id, product_name_raw) values
      (v_org_a, v_inv_a, v_tag||'_item_A'),
      (v_org_b, v_inv_b, v_tag||'_item_B');

    -- prospects
    insert into public.prospects (organization_id, name) values
      (v_org_a, v_tag||'_prosp_A'),
      (v_org_b, v_tag||'_prosp_B');

    -- ===== IMPERSONATE user_a =====
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user_a::text, 'role', 'authenticated',
                        'email', v_tag||'_a@test.local')::text, true);

    -- A sees only org_a rows
    select count(*) into v_n from public.customers where organization_id = v_org_b;
    if v_n <> 0 then raise exception 'RLS_FAIL: user_a sees customers of org_b (% rows)', v_n; end if;
    select count(*) into v_n from public.customers where organization_id = v_org_a;
    if v_n < 2 then raise exception 'RLS_FAIL: user_a cannot see own customers (% rows)', v_n; end if;

    select count(*) into v_n from public.invoices where organization_id = v_org_b;
    if v_n <> 0 then raise exception 'RLS_FAIL: user_a sees invoices of org_b'; end if;
    select count(*) into v_n from public.invoices where organization_id = v_org_a;
    if v_n < 1 then raise exception 'RLS_FAIL: user_a cannot see own invoices'; end if;

    select count(*) into v_n from public.invoice_items where organization_id = v_org_b;
    if v_n <> 0 then raise exception 'RLS_FAIL: user_a sees invoice_items of org_b'; end if;

    select count(*) into v_n from public.prospects where organization_id = v_org_b;
    if v_n <> 0 then raise exception 'RLS_FAIL: user_a sees prospects of org_b'; end if;

    -- INSERT into org_b must be blocked
    v_did := false;
    begin
      insert into public.customers (organization_id, name) values (v_org_b, v_tag||'_leak_cust');
      v_did := true;
    exception when insufficient_privilege then null;
             when others then if SQLSTATE = '42501' then null; else raise; end if;
    end;
    if v_did then raise exception 'RLS_FAIL: user_a inserted customer into org_b'; end if;

    v_did := false;
    begin
      insert into public.invoices (organization_id, invoice_number, issue_date)
        values (v_org_b, v_tag||'-LEAK', current_date);
      v_did := true;
    exception when insufficient_privilege then null;
             when others then if SQLSTATE = '42501' then null; else raise; end if;
    end;
    if v_did then raise exception 'RLS_FAIL: user_a inserted invoice into org_b'; end if;

    -- UPDATE / DELETE on org_b rows must affect 0 rows
    update public.customers set name = name || '_hacked' where id = v_cust_b;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'RLS_FAIL: user_a updated % rows in org_b customers', v_n; end if;

    delete from public.customers where id = v_cust_b;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'RLS_FAIL: user_a deleted % rows in org_b customers', v_n; end if;

    -- ===== IMPERSONATE user_b =====
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user_b::text, 'role', 'authenticated',
                        'email', v_tag||'_b@test.local')::text, true);

    select count(*) into v_n from public.customers where organization_id = v_org_a;
    if v_n <> 0 then raise exception 'RLS_FAIL: user_b sees customers of org_a'; end if;
    select count(*) into v_n from public.customers where organization_id = v_org_b;
    if v_n < 1 then raise exception 'RLS_FAIL: user_b cannot see own customers'; end if;

    select count(*) into v_n from public.invoices where organization_id = v_org_a;
    if v_n <> 0 then raise exception 'RLS_FAIL: user_b sees invoices of org_a'; end if;
    select count(*) into v_n from public.invoices where organization_id = v_org_b;
    if v_n < 1 then raise exception 'RLS_FAIL: user_b cannot see own invoices'; end if;

    -- restore role and roll back the subtransaction
    reset role;
    raise exception 'ROLLBACK_SENTINEL';
  exception
    when others then
      -- subtransaction is rolled back automatically; classify the error
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
grant execute on function public._test_rls_isolation() to service_role;