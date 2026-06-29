
-- Platform-wide cross-org stats (SECURITY DEFINER, gated to platform admins)
create or replace function public.platform_org_stats()
returns table (
  organization_id uuid,
  members bigint,
  customers bigint,
  invoices bigint,
  orders bigint,
  prospects bigint,
  invoiced_ytd numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  return query
  with m as (select organization_id, count(*)::bigint c from public.organization_members group by 1),
       c as (select organization_id, count(*)::bigint c from public.customers group by 1),
       i as (select organization_id, count(*)::bigint c from public.invoices group by 1),
       o as (select organization_id, count(*)::bigint c from public.orders group by 1),
       p as (select organization_id, count(*)::bigint c from public.prospects group by 1),
       y as (
         select organization_id, coalesce(sum(subtotal),0)::numeric s
           from public.invoices
          where status <> 'cancelled'
            and issue_date >= date_trunc('year', current_date)
          group by 1
       )
  select org.id,
         coalesce(m.c,0), coalesce(c.c,0), coalesce(i.c,0),
         coalesce(o.c,0), coalesce(p.c,0), coalesce(y.s,0)
    from public.organizations org
    left join m on m.organization_id = org.id
    left join c on c.organization_id = org.id
    left join i on i.organization_id = org.id
    left join o on o.organization_id = org.id
    left join p on p.organization_id = org.id
    left join y on y.organization_id = org.id;
end;
$$;

grant execute on function public.platform_org_stats() to authenticated;

-- Allow platform admins to create owner invitations for any org
create or replace function public.platform_invite_owner(_org uuid, _email text, _role app_role default 'owner')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_email text := lower(trim(_email));
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'missing_email';
  end if;

  delete from public.invitations
   where organization_id = _org and lower(email) = v_email and accepted_at is null;

  insert into public.invitations (organization_id, email, role, invited_by)
  values (_org, v_email, _role, auth.uid())
  returning token into v_token;

  return v_token;
end;
$$;

grant execute on function public.platform_invite_owner(uuid, text, app_role) to authenticated;
