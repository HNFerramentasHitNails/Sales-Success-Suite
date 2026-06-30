import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Check, Info, Lock, ExternalLink, Copy } from "lucide-react";

type Plan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price_monthly: number | null;
  currency: string;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  stripe_price_id: string | null;
};

type PlanFeature = {
  plan_id: string;
  feature_key: string;
  enabled: boolean;
  limit_int: number | null;
};

const FEATURE_LABELS: Record<string, string> = {
  max_users: "Utilizadores",
  max_connectors: "Conectores de integração",
  module_commissions: "Módulo de Comissões",
  module_integrations: "Módulo de Integrações",
};

const formatLimit = (key: string, f?: PlanFeature) => {
  if (!f) return "—";
  if (key.startsWith("module_")) return f.enabled ? "Incluído" : "Não incluído";
  if (f.limit_int === null) return "Ilimitado";
  return `Até ${f.limit_int}`;
};

const formatPrice = (p: Plan) => {
  if (p.price_monthly === null) return "Sob consulta";
  if (Number(p.price_monthly) === 0) return "Grátis";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: p.currency || "EUR",
    maximumFractionDigits: 0,
  }).format(Number(p.price_monthly)) + "/mês";
};

export default function Plan() {
  const { activeOrg, isAdmin } = useOrganization();
  const { subscription, features, refresh } = useEntitlements();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[]>([]);
  const [usage, setUsage] = useState<{ users: number; connectors: number }>({ users: 0, connectors: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [savingPrice, setSavingPrice] = useState<string | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);

  // A configuração de faturação da plataforma só é visível a administradores da plataforma.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) { setPlatformAdmin(false); return; }
      supabase.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle()
        .then(({ data: row }) => setPlatformAdmin(!!row));
    });
  }, []);

  const WEBHOOK_URL = "https://itynqpvwzlkovrvsbluw.supabase.co/functions/v1/platform-stripe-webhook";

  const load = async () => {
    if (!activeOrg) return;
    const [p, pf, members, invs, conns] = await Promise.all([
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("plan_features").select("*"),
      supabase.from("organization_members").select("id", { count: "exact", head: true })
        .eq("organization_id", activeOrg.id).eq("status", "active"),
      supabase.from("invitations").select("id", { count: "exact", head: true })
        .eq("organization_id", activeOrg.id).eq("status", "pending"),
      supabase.from("connections").select("id", { count: "exact", head: true })
        .eq("organization_id", activeOrg.id),
    ]);
    if (p.data) {
      const list = p.data as Plan[];
      setPlans(list);
      const initial: Record<string, string> = {};
      list.forEach((pl) => { initial[pl.id] = pl.stripe_price_id ?? ""; });
      setPriceInputs(initial);
    }
    if (pf.data) setPlanFeatures(pf.data as PlanFeature[]);
    setUsage({
      users: (members.count ?? 0) + (invs.count ?? 0),
      connectors: conns.count ?? 0,
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.id]);

  useEffect(() => {
    const billing = searchParams.get("billing");
    if (!billing) return;
    if (billing === "success") {
      toast({ title: "Subscrição ativada", description: "Pagamento concluído com sucesso." });
      refresh();
      load();
    } else if (billing === "cancel") {
      toast({ title: "Pagamento cancelado", description: "Pode tentar novamente quando quiser." });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("billing");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold tracking-tight">Plano</h1>
        <Alert><AlertDescription>Só administradores podem gerir o plano da organização.</AlertDescription></Alert>
      </div>
    );
  }

  const switchPlan = async (plan: Plan) => {
    if (!activeOrg || !subscription) return;
    if (plan.id === subscription.plan_id) return;

    // Enterprise: contacto
    if (plan.key === "enterprise") {
      window.location.href = "mailto:?subject=Pedido%20de%20contacto%20-%20Plano%20Enterprise";
      return;
    }

    // Trial (grátis): mudança direta
    if (plan.key === "trial" || Number(plan.price_monthly ?? 0) === 0) {
      if (!confirm(`Mudar o plano para "${plan.name}"?`)) return;
      setBusy(plan.id);
      const { error } = await supabase
        .from("organization_subscription")
        .update({
          plan_id: plan.id,
          status: "active",
          trial_ends_at: null,
          current_period_end: new Date(Date.now() + 365 * 86400_000).toISOString(),
        })
        .eq("organization_id", activeOrg.id);
      setBusy(null);
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Plano atualizado", description: `Está agora no plano ${plan.name}.` });
        await refresh();
        load();
      }
      return;
    }

    // Planos pagos: Stripe Checkout
    setBusy(plan.id);
    const { data, error } = await supabase.functions.invoke("create-subscription-checkout", {
      body: { plan_id: plan.id, organization_id: activeOrg.id },
    });
    setBusy(null);
    if (error) {
      const msg = (error as any).context?.error || error.message || "";
      if (typeof msg === "string" && msg.includes("payments_not_configured")) {
        toast({ title: "Pagamentos ainda não configurados", variant: "destructive" });
      } else if (typeof msg === "string" && msg.includes("plan_without_price")) {
        toast({ title: "Este plano ainda não tem preço definido", variant: "destructive" });
      } else {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      }
      return;
    }
    const errCode = (data as any)?.error;
    if (errCode === "payments_not_configured") {
      toast({ title: "Pagamentos ainda não configurados", variant: "destructive" });
      return;
    }
    if (errCode === "plan_without_price") {
      toast({ title: "Este plano ainda não tem preço definido", variant: "destructive" });
      return;
    }
    if ((data as any)?.url) {
      window.location.href = (data as any).url;
    } else {
      toast({ title: "Erro", description: "Não foi possível iniciar o pagamento.", variant: "destructive" });
    }
  };

  const openBillingPortal = async () => {
    if (!activeOrg) return;
    setBusy("portal");
    const { data, error } = await supabase.functions.invoke("create-billing-portal", {
      body: { organization_id: activeOrg.id },
    });
    setBusy(null);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    const errCode = (data as any)?.error;
    if (errCode === "no_customer") {
      toast({ title: "Sem faturação ativa", description: "Subscreva um plano pago para gerir a faturação." });
      return;
    }
    if (errCode === "payments_not_configured") {
      toast({ title: "Pagamentos ainda não configurados", variant: "destructive" });
      return;
    }
    if ((data as any)?.url) {
      window.location.href = (data as any).url;
    }
  };

  const savePrice = async (planId: string) => {
    setSavingPrice(planId);
    const { error } = await supabase.rpc("set_plan_price", {
      _plan_id: planId,
      _price_id: priceInputs[planId] ?? "",
    });
    setSavingPrice(null);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Price ID guardado" });
      load();
    }
  };

  const featuresOf = (planId: string) =>
    planFeatures.filter((f) => f.plan_id === planId);

  const currentPlanKey = subscription?.plans?.key;
  const trialEnds = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null;

  const usersLimit = features.max_users?.limit_int ?? null;
  const connectorsLimit = features.max_connectors?.limit_int ?? null;

  const paidConfigurablePlans = plans.filter(
    (p) => p.key !== "trial" && p.key !== "enterprise" && Number(p.price_monthly ?? 0) > 0
  );

  const ctaLabel = (p: Plan, isCurrent: boolean) => {
    if (isCurrent) return "Plano atual";
    if (busy === p.id) return "A processar…";
    if (p.key === "enterprise") return "Contactar";
    if (p.key === "trial" || Number(p.price_monthly ?? 0) === 0) return "Mudar para este plano";
    return "Mudar para este plano";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Plano</h1>
          <p className="text-muted-foreground text-sm">Subscrição da organização, uso atual e planos disponíveis.</p>
        </div>
        <Button variant="outline" onClick={openBillingPortal} disabled={busy === "portal"}>
          <ExternalLink className="h-4 w-4 mr-2" />
          {busy === "portal" ? "A abrir…" : "Gerir faturação"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Plano atual: {subscription?.plans?.name ?? "—"}
            {subscription?.status && (
              <Badge variant={subscription.status === "active" ? "default" : "secondary"}>
                {subscription.status === "trialing" ? "Em avaliação"
                  : subscription.status === "active" ? "Ativo"
                  : subscription.status === "past_due" ? "Em atraso"
                  : "Cancelado"}
              </Badge>
            )}
          </CardTitle>
          {trialEnds && subscription?.status === "trialing" && (
            <CardDescription>
              Avaliação termina a {trialEnds.toLocaleDateString("pt-PT")}.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Utilizadores</div>
            <div className="text-2xl font-semibold">
              {usage.users} <span className="text-sm text-muted-foreground">/ {usersLimit ?? "∞"}</span>
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Conectores</div>
            <div className="text-2xl font-semibold">
              {usage.connectors} <span className="text-sm text-muted-foreground">/ {connectorsLimit ?? "∞"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="font-display text-xl font-semibold mb-3">Planos disponíveis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.filter((p) => p.is_public).map((p) => {
            const isCurrent = p.key === currentPlanKey;
            const fs = featuresOf(p.id);
            return (
              <Card key={p.id} className={isCurrent ? "border-primary" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {p.name}
                    {isCurrent && <Badge>Atual</Badge>}
                  </CardTitle>
                  <CardDescription>{p.description}</CardDescription>
                  <div className="text-2xl font-bold mt-2">{formatPrice(p)}</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1.5 text-sm">
                    {Object.keys(FEATURE_LABELS).map((k) => {
                      const f = fs.find((x) => x.feature_key === k);
                      const included = k.startsWith("module_") ? f?.enabled : true;
                      return (
                        <li key={k} className="flex items-center gap-2">
                          {included ? (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          ) : (
                            <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <span className="flex-1">{FEATURE_LABELS[k]}</span>
                          <span className="text-muted-foreground">{formatLimit(k, f)}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : "default"}
                    disabled={isCurrent || busy === p.id}
                    onClick={() => switchPlan(p)}
                  >
                    {ctaLabel(p, isCurrent)}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {platformAdmin && (
      <Card>
        <CardHeader>
          <CardTitle>Configuração de faturação (plataforma)</CardTitle>
          <CardDescription>
            Stripe Price IDs para cada plano pago. Esta é configuração da plataforma — afeta todas as organizações.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {paidConfigurablePlans.map((p) => (
            <div key={p.id} className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-2 items-end">
              <div>
                <Label>{p.name}</Label>
                <div className="text-xs text-muted-foreground">{formatPrice(p)}</div>
              </div>
              <Input
                placeholder="price_..."
                value={priceInputs[p.id] ?? ""}
                onChange={(e) => setPriceInputs({ ...priceInputs, [p.id]: e.target.value })}
              />
              <Button
                variant="outline"
                disabled={savingPrice === p.id}
                onClick={() => savePrice(p.id)}
              >
                {savingPrice === p.id ? "A guardar…" : "Guardar"}
              </Button>
            </div>
          ))}

          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-sm font-medium">Webhook do Stripe</div>
            <div className="text-xs text-muted-foreground">
              Registe este URL no Stripe (Developers → Webhooks) e selecione os eventos:
              <code className="ml-1">checkout.session.completed</code>,
              <code className="ml-1">customer.subscription.updated</code>,
              <code className="ml-1">customer.subscription.deleted</code>.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-2 rounded break-all">{WEBHOOK_URL}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(WEBHOOK_URL);
                  toast({ title: "URL copiado" });
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      <div className="text-xs text-muted-foreground">
        Precisa de algo diferente? <button className="underline" onClick={() => navigate("/app/settings")}>Contacte o suporte</button>.
      </div>
    </div>
  );
}