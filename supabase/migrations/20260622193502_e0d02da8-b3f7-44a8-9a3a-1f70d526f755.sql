drop trigger if exists trg_customers_plan_limit on public.customers;
drop function if exists public.enforce_customer_plan_limit() cascade;
drop function if exists public.org_can_add_customer(uuid);
drop function if exists public.org_can_add_member(uuid);
drop function if exists public.touch_organization_modules() cascade;