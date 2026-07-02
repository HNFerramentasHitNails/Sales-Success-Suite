import { Navigate, useSearchParams } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OrgSettings from "@/pages/OrgSettings";
import Team from "@/pages/Team";
import Plan from "@/pages/Plan";
import AiSettings from "@/pages/AiSettings";
import OutreachWhatsApp from "@/pages/OutreachWhatsApp";
import OutreachDomains from "@/pages/OutreachDomains";

const TABS = [
  { k: "org", label: "Organização", el: OrgSettings },
  { k: "team", label: "Equipa", el: Team },
  { k: "plan", label: "Plano", el: Plan },
  { k: "ai", label: "IA", el: AiSettings },
  { k: "whatsapp", label: "WhatsApp", el: OutreachWhatsApp },
  { k: "domains", label: "Domínios de envio", el: OutreachDomains },
];

export default function SettingsHub() {
  const { isAdmin } = useOrganization();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || "org";

  if (!isAdmin) return <Navigate to="/app/dashboard" replace />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Definições"
        description="Organização, equipa, plano, IA e canais — tudo num só sítio."
        icon={<SettingsIcon className="h-6 w-6" />}
      />
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v })}>
        <TabsList className="flex-wrap h-auto justify-start" data-tour="settings-tabs">
          {TABS.map((t) => <TabsTrigger key={t.k} value={t.k}>{t.label}</TabsTrigger>)}
        </TabsList>
        {TABS.map((t) => {
          const El = t.el;
          return (
            <TabsContent key={t.k} value={t.k} className="mt-6">
              <El />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
