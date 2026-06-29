
CREATE TABLE public.reward_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  condition_type text NOT NULL CHECK (condition_type IN ('valor_minimo','categoria','produto')),
  condition_value text,
  threshold numeric NOT NULL DEFAULT 0,
  reward_type text NOT NULL CHECK (reward_type IN ('wallet_credit','voucher','desconto_pct')),
  reward_value numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  starts_at date,
  ends_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.reward_campaigns(organization_id);
CREATE INDEX ON public.reward_campaigns(organization_id, is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_campaigns TO authenticated;
GRANT ALL ON public.reward_campaigns TO service_role;
SELECT public.apply_tenant_rls('public.reward_campaigns');
CREATE TRIGGER touch_reward_campaigns BEFORE UPDATE ON public.reward_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.reward_campaign_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.reward_campaigns(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reward_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, order_id)
);
CREATE INDEX ON public.reward_campaign_redemptions(organization_id);
CREATE INDEX ON public.reward_campaign_redemptions(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_campaign_redemptions TO authenticated;
GRANT ALL ON public.reward_campaign_redemptions TO service_role;
SELECT public.apply_tenant_rls('public.reward_campaign_redemptions');
