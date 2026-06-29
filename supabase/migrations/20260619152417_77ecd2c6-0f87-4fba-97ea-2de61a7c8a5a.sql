
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS billing_address jsonb,
  ADD COLUMN IF NOT EXISTS shipping_address jsonb,
  ADD COLUMN IF NOT EXISTS discount_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moloni_document_id text;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS discount_pct numeric NOT NULL DEFAULT 0;
