-- Multi-tenant RLS isolation regression test (transactional, auto-rollback).
-- Run as a privileged role (postgres / supabase_admin):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
-- The script seeds two orgs/users, exercises RLS as each authenticated user,
-- raises on any leak, and ROLLBACKs all seed data at the end. Nothing persists.

begin;

do $$
declare
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_inv_a uuid := gen_random_uuid();
  v_inv_b uuid := gen_random_uuid();
  v_cust_a uuid;
  v_cust_b uuid;
  v_tag text := 'rls_test_' || substr(replace(gen_random_uuid()::text,'-',''),1,12);
  v_n integer;
  v_did boolean;
begin
  -- ===== SEED (runs as privileged role; bypasses RLS) =====
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
  select id into v_cust_a from public.customers where organization_id = v_org_a and name = v_tag||'_cust_A1';
  select id into v_cust_b from public.customers where organization_id = v_org_b and name = v_tag||'_cust_B1';

  insert into public.invoices (id, organization_id, invoice_number, issue_date) values
    (v_inv_a, v_org_a, v_tag||'-INV-A1', current_date),
    (v_inv_b, v_org_b, v_tag||'-INV-B1', current_date);

  insert into public.invoice_items (organization_id, invoice_id, product_name_raw) values
    (v_org_a, v_inv_a, v_tag||'_item_A'),
    (v_org_b, v_inv_b, v_tag||'_item_B');

  insert into public.prospects (organization_id, name) values
    (v_org_a, v_tag||'_prosp_A'),
    (v_org_b, v_tag||'_prosp_B');

  -- ===== IMPERSONATE user_a =====
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_a::text, 'role', 'authenticated',
                      'email', v_tag||'_a@test.local')::text, true);

  select count(*) into v_n from public.customers     where organization_id = v_org_b;
  if v_n <> 0 then raise exception 'RLS_FAIL: userA sees customers of org_b (%)', v_n; end if;
  select count(*) into v_n from public.customers     where organization_id = v_org_a;
  if v_n < 2 then raise exception 'RLS_FAIL: userA cannot see own customers (%)', v_n; end if;

  select count(*) into v_n from public.invoices      where organization_id = v_org_b;
  if v_n <> 0 then raise exception 'RLS_FAIL: userA sees invoices of org_b'; end if;
  select count(*) into v_n from public.invoices      where organization_id = v_org_a;
  if v_n < 1 then raise exception 'RLS_FAIL: userA cannot see own invoices'; end if;

  select count(*) into v_n from public.invoice_items where organization_id = v_org_b;
  if v_n <> 0 then raise exception 'RLS_FAIL: userA sees invoice_items of org_b'; end if;

  select count(*) into v_n from public.prospects     where organization_id = v_org_b;
  if v_n <> 0 then raise exception 'RLS_FAIL: userA sees prospects of org_b'; end if;

  -- INSERT into other org must be blocked
  v_did := false;
  begin
    insert into public.customers (organization_id, name) values (v_org_b, v_tag||'_leak');
    v_did := true;
  exception when insufficient_privilege then null;
           when others then if SQLSTATE = '42501' then null; else raise; end if;
  end;
  if v_did then raise exception 'RLS_FAIL: userA inserted customer into org_b'; end if;

  v_did := false;
  begin
    insert into public.invoices (organization_id, invoice_number, issue_date)
      values (v_org_b, v_tag||'-LEAK', current_date);
    v_did := true;
  exception when insufficient_privilege then null;
           when others then if SQLSTATE = '42501' then null; else raise; end if;
  end;
  if v_did then raise exception 'RLS_FAIL: userA inserted invoice into org_b'; end if;

  -- UPDATE/DELETE on other org must touch 0 rows
  update public.customers set name = name || '_hacked' where id = v_cust_b;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'RLS_FAIL: userA updated % rows in org_b customers', v_n; end if;

  delete from public.customers where id = v_cust_b;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'RLS_FAIL: userA deleted % rows in org_b customers', v_n; end if;

  -- ===== IMPERSONATE user_b =====
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_b::text, 'role', 'authenticated',
                      'email', v_tag||'_b@test.local')::text, true);

  select count(*) into v_n from public.customers where organization_id = v_org_a;
  if v_n <> 0 then raise exception 'RLS_FAIL: userB sees customers of org_a'; end if;
  select count(*) into v_n from public.customers where organization_id = v_org_b;
  if v_n < 1 then raise exception 'RLS_FAIL: userB cannot see own customers'; end if;

  select count(*) into v_n from public.invoices  where organization_id = v_org_a;
  if v_n <> 0 then raise exception 'RLS_FAIL: userB sees invoices of org_a'; end if;
  select count(*) into v_n from public.invoices  where organization_id = v_org_b;
  if v_n < 1 then raise exception 'RLS_FAIL: userB cannot see own invoices'; end if;

  reset role;
  raise notice 'RLS_ISOLATION_OK';
end$$;

rollback;