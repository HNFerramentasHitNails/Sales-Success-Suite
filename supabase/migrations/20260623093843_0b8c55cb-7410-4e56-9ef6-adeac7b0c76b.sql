-- Marco 4c-ii: Stripe payments
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS payment_ref text,
  ADD COLUMN IF NOT EXISTS payment_url text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_payment_ref ON public.orders(payment_ref) WHERE payment_ref IS NOT NULL;

-- Update Stripe connector definition to also accept webhook signing secret
UPDATE public.connector_definitions
   SET config_schema = jsonb_build_object('fields', jsonb_build_array(
        jsonb_build_object('key','account_label','label','Etiqueta da conta','required',false,'secret',false,'type','text'),
        jsonb_build_object('key','publishable_key','label','Chave publicável (pk_...)','required',false,'secret',false,'type','text'),
        jsonb_build_object('key','secret_key','label','Chave secreta (sk_...)','required',true,'secret',true,'type','password'),
        jsonb_build_object('key','stripe_webhook_signing_secret','label','Signing secret do webhook (whsec_...)','required',false,'secret',true,'type','password')
       ))
 WHERE key = 'stripe';
