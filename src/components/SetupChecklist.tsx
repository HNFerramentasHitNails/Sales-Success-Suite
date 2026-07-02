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
  const { activeOrg } = useOrganization();
  const { isEnabled } = useEntitlements();
  const [steps, setSteps] = useState<Step[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const dismissKey = activeOrg ? `setup_dismissed_${activeOrg.id}` : "";

  const load = useCallback(async () => {
    if (!activeOrg) return;
    const org = activeOrg.id;
    const [leadsRes, campRes, waRes, domRes] = await Promise.all([
      supabase.from("outreach_leads").select("id", { count: "exact", head: true }).eq("organization_id", org).is("deleted_at", null),
      supabase.from("outreach_campaigns").select("id", { count: "exact", head: true }).eq("organization_id", org),
      supabase.from("outreach_whatsapp_instances").select("id").eq("organization_id", org).eq("status", "open").limit(1),
      supabase.from("outreach_email_domains").select("id").eq("organization_id", org).eq("is_active", true).gte("health_score", 100).limit(1),
    ]);
    setSteps([
      { key: "wa", label: "Ligar o WhatsApp", done: (waRes.data?.length ?? 0) > 0, href: "/app/settings?tab=whatsapp", cta: "Ligar" },
      { key: "dom", label: "Verificar um domínio de email", done: (domRes.data?.length ?? 0) > 0, href: "/app/settings?tab=domains", cta: "Configurar" },
      { key: "leads", label: "Importar ou capturar leads", done: (leadsRes.count ?? 0) > 0, href: "/app/marketplace", cta: "Capturar" },
      { key: "camp", label: "Criar a primeira campanha", done: (campRes.count ?? 0) > 0, href: "/app/campaigns", cta: "Criar" },
    ]);
    setLoaded(true);
  }, [activeOrg]);

  useEffect(() => {
    if (dismissKey) setDismissed(localStorage.getItem(dismissKey) === "1");
    load();
  }, [load, dismissKey]);

  if (!isEnabled("module_outreach") || !loaded || dismissed) return null;
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
