alter table public.partners
  add column if not exists district text,
  add column if not exists city text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;