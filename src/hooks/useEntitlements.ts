import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

export type Feature = {
  enabled: boolean;
  limit_int: number | null;
};

export type Subscription = {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plans: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    price_monthly: number | null;
    currency: string;
  } | null;
};

const FEATURE_KEYS = [
  "max_users",
  "max_connectors",
  "module_commissions",
  "module_integrations",
] as const;

export function useEntitlements() {
  const { activeOrg } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [features, setFeatures] = useState<Record<string, Feature>>({});

  const load = async () => {
    if (!activeOrg) {
      setSubscription(null);
      setFeatures({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: sub } = await supabase
      .from("organization_subscription")
      .select("id, organization_id, plan_id, status, trial_ends_at, current_period_end, plans(id, key, name, description, price_monthly, currency)")
      .eq("organization_id", activeOrg.id)
      .maybeSingle();
    setSubscription((sub as unknown as Subscription) ?? null);

    const map: Record<string, Feature> = {};
    await Promise.all(
      FEATURE_KEYS.map(async (k) => {
        const { data } = await supabase.rpc("org_feature", {
          _org_id: activeOrg.id,
          _feature_key: k,
        });
        const row = Array.isArray(data) ? data[0] : null;
        map[k] = {
          enabled: row?.enabled ?? true,
          limit_int: row?.limit_int ?? null,
        };
      })
    );
    setFeatures(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.id]);

  const isEnabled = (key: string) => features[key]?.enabled ?? true;
  const limitOf = (key: string) => features[key]?.limit_int ?? null;

  return { loading, subscription, features, isEnabled, limitOf, refresh: load };
}