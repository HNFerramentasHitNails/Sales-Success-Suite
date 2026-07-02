import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, X, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Step = { key: string; label: string; done: boolean; href: string; cta: string };

export default function SetupChecklist() {
  const { activeOrg, isAdmin } = useOrganization();
  const { isEnabled } = useEntitlements();
  const outreachOn = isEnabled("module_outreach");
  const [steps, setSteps] = useState<Step[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const dismissKey = activeOrg ? `setup_dismissed_${activeOrg.id}` : "";

  const load = useCallback(async () => {
    if (!activeOrg) return;
    const org = activeOrg.id;

    const [membersRes, productsRes, customersRes, connRes, ordersRes, leadsRes, campRes, waRes, domRes] = await Promise.all([
      supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "active"),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", org),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", org),
      supabase.from("connections").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "active"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", org),
      outreachOn
        ? supabase.from("outreach_leads").select("id", { count: "exact", head: true }).eq("organization_id", org).is("deleted_at", null)
        : Promise.resolve({ count: 0 } as { count: number | null }),
      outreachOn
        ? supabase.from("outreach_campaigns").select("id", { count: "exact", head: true }).eq("organization_id", org)
        : Promise.resolve({ count: 0 } as { count: number | null }),
      outreachOn
        ? supabase.from("outreach_whatsapp_instances").select("id").eq("organization_id", org).eq("status", "open").limit(1)
        : Promise.resolve({ data: [] as unknown[] }),
      outreachOn
        ? supabase.from("outreach_email_domains").select("id").eq("organization_id", org).eq("is_active", true).gte("health_score", 100).limit(1)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const core: Step[] = [
      { key: "org", label: "Configurar dados fiscais e marca", done: !!activeOrg.legal_name || !!activeOrg.tax_id, href: "/app/settings?tab=org", cta: "Configurar" },
      { key: "team", label: "Convidar a equipa", done: (membersRes.count ?? 0) > 1, href: "/app/settings?tab=team", cta: "Convidar" },
      { key: "products", label: "Adicionar produtos ao catálogo", done: (productsRes.count ?? 0) > 0, href: "/app/products", cta: "Adicionar" },
      { key: "customers", label: "Adicionar o primeiro cliente", done: (customersRes.count ?? 0) > 0, href: "/app/customers", cta: "Adicionar" },
      { key: "connect", label: "Ligar pagamentos e/ou faturação", done: (connRes.count ?? 0) > 0, href: "/app/integrations", cta: "Ligar" },
      { key: "order", label: "Criar a primeira encomenda", done: (ordersRes.count ?? 0) > 0, href: "/app/orders", cta: "Criar" },
    ];

    const outreach: Step[] = outreachOn ? [
      { key: "wa", label: "Ligar o WhatsApp", done: (waRes.data?.length ?? 0) > 0, href: "/app/settings?tab=whatsapp", cta: "Ligar" },
      { key: "dom", label: "Verificar um domínio de email", done: (domRes.data?.length ?? 0) > 0, href: "/app/settings?tab=domains", cta: "Configurar" },
      { key: "leads", label: "Importar ou capturar leads", done: (leadsRes.count ?? 0) > 0, href: "/app/marketplace", cta: "Capturar" },
      { key: "camp", label: "Criar a primeira campanha", done: (campRes.count ?? 0) > 0, href: "/app/campaigns", cta: "Criar" },
    ] : [];

    setSteps([...core, ...outreach]);
    setLoaded(true);
  }, [activeOrg, outreachOn]);

  useEffect(() => {
    if (dismissKey) setDismissed(localStorage.getItem(dismissKey) === "1");
    load();
  }, [load, dismissKey]);

  if (!isAdmin || !loaded || dismissed) return null;
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null; // tudo feito → não incomodar

  return (
    <Card className="border-primary/30 bg-primary/5" data-tour="dash-checklist">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" /> Primeiros passos ({doneCount}/{steps.length})
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (dismissKey) localStorage.setItem(dismissKey, "1"); setDismissed(true); }}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
            <span className="flex items-center gap-2 text-sm">
              {s.done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
            </span>
            {!s.done && <Button asChild size="sm" variant="outline"><Link to={s.href}>{s.cta}</Link></Button>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
