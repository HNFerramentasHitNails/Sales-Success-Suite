
ALTER TABLE public.customer_wallet_transactions
  DROP CONSTRAINT IF EXISTS customer_wallet_transactions_source_type_check;

ALTER TABLE public.customer_wallet_transactions
  ADD CONSTRAINT customer_wallet_transactions_source_type_check
  CHECK (
    source_type = ANY (ARRAY['manual','adjustment','order','refund','voucher','topup','other'])
    OR source_type LIKE 'campaign:%'
  );
