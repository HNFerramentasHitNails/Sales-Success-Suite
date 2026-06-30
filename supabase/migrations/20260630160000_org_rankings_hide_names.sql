-- Task 12 — visibilidade configurável de rankings (evitar exposição desproporcionada).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS rankings_hide_names boolean NOT NULL DEFAULT false;
