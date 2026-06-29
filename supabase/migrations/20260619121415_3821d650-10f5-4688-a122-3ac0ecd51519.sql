
alter table public.invoices
  add column if not exists category text,
  add column if not exists sales_rep_id uuid references auth.users(id) on delete set null;

create index if not exists invoices_org_issue_date_idx on public.invoices (organization_id, issue_date);
create index if not exists invoices_org_category_idx on public.invoices (organization_id, category);
create index if not exists invoices_org_sales_rep_idx on public.invoices (organization_id, sales_rep_id);
