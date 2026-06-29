create table if not exists public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  content text not null default '',
  category text,
  tags text[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.knowledge_articles to authenticated;
grant all on public.knowledge_articles to service_role;
select public.apply_tenant_rls('public.knowledge_articles');
drop trigger if exists trg_knowledge_articles_touch on public.knowledge_articles;
create trigger trg_knowledge_articles_touch before update on public.knowledge_articles
  for each row execute function public.touch_updated_at();
create index if not exists idx_knowledge_articles_org on public.knowledge_articles(organization_id);