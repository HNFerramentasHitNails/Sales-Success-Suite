
-- plans (global)
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  price_monthly numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  stripe_price_id text,
  max_users integer,
  max_customers integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select ON public.plans;
CREATE POLICY plans_select ON public.plans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS plans_platform_admin_write ON public.plans;
CREATE POLICY plans_platform_admin_write ON public.plans FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_plans_touch ON public.plans;
CREATE TRIGGER trg_plans_touch BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.plans (key, name, price_monthly, currency, max_users, max_customers, features, position) VALUES
  ('free',     'Free',     0,   'EUR', 2,    200,  '["1 organização","Até 2 utilizadores","Até 200 clientes","Funcionalidades essenciais"]'::jsonb, 0),
  ('pro',      'Pro',      49,  'EUR', 10,   5000, '["Até 10 utilizadores","Até 5.000 clientes","Integrações (Moloni, Shopify, Google)","Agentes IA","Comissões avançadas"]'::jsonb, 1),
  ('business', 'Business', 149, 'EUR', NULL, NULL, '["Utilizadores ilimitados","Clientes ilimitados","Todas as integrações","Agentes IA avançados","Suporte prioritário","White-label completo"]'::jsonb, 2)
ON CONFLICT (key) DO NOTHING;

-- subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subs_select_org ON public.subscriptions;
CREATE POLICY subs_select_org ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS subs_platform_admin_write ON public.subscriptions;
CREATE POLICY subs_platform_admin_write ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_subs_touch ON public.subscriptions;
CREATE TRIGGER trg_subs_touch BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_subs_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subs_stripe_sub ON public.subscriptions(stripe_subscription_id);
