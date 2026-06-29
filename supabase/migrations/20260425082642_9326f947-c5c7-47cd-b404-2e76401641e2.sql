-- Fix search_path on trigger functions
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

-- Tighten org insert: only allow if user not already in an org
drop policy if exists "org_insert_authenticated" on public.organizations;
create policy "org_insert_first_org" on public.organizations for insert to authenticated
  with check (public.get_user_org(auth.uid()) is null);
