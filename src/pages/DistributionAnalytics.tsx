import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Store, FileText, AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Partner = {
  id: string;
  name: string;
  type: "distributor" | "reseller" | "agent" | "other";
  status: "prospect" | "active" | "inactive" | "suspended";
  region: string | null;
  customer_id: string | null;
};
type Contract = {
  id: string;
  partner_id: string;
  title: string;
  status: "draft" | "active" | "expired" | "terminated";
  end_date: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  prospect: "Prospect",
  active: "Ativo",
  inactive: "Inativo",
  suspended: "Suspenso",
};
const TYPE_LABEL: Record<string, string> = {
  distributor: "Distribuidor",
  reseller: "Revendedor",
  agent: "Agente",
  other: "Outro",
};
const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  expired: "Expirado",
  terminated: "Terminado",
};

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 200 80% 55%))",
  "hsl(var(--chart-3, 30 90% 55%))",
  "hsl(var(--chart-4, 280 60% 60%))",
  "hsl(var(--chart-5, 140 50% 50%))",
];

export default function DistributionAnalytics() {
  const { activeOrg } = useOrganization();
  const currency = activeOrg?.currency || "EUR";
  const fmt = useMemo(
    () => new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 0 }),
    [currency]
  );

  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [topRevenue, setTopRevenue] = useState<{ name: string; total: number }[]>([]);

  const load = useCallback(async () => {
    if (!activeOrg?.id) return;
    setLoading(true);
    try {
      const [{ data: p, error: pe }, { data: c, error: ce }] = await Promise.all([
        supabase
          .from("distribution_partners")
          .select("id, name, type, status, region, customer_id")
          .eq("organization_id", activeOrg.id),
        supabase
          .from("distribution_contracts")
          .select("id, partner_id, title, status, end_date")
          .eq("organization_id", activeOrg.id),
      ]);
      if (pe) throw pe;
      if (ce) throw ce;
      const partnersData = (p || []) as Partner[];
      const contractsData = (c || []) as Contract[];
      setPartners(partnersData);
      setContracts(contractsData);

      // Top revenue por parceiros com customer_id
      const withCustomer = partnersData.filter((x) => x.customer_id);
      if (withCustomer.length > 0) {
        const customerIds = withCustomer.map((x) => x.customer_id) as string[];
        const { data: orders, error: oe } = await supabase
          .from("orders")
          .select("customer_id, total, status")
          .eq("organization_id", activeOrg.id)
          .in("customer_id", customerIds)
          .neq("status", "cancelada");
        if (!oe && orders) {
          const totals = new Map<string, number>();
          for (const o of orders as any[]) {
            const key = o.customer_id as string;
            totals.set(key, (totals.get(key) || 0) + Number(o.total || 0));
          }
          const ranked = withCustomer
            .map((pr) => ({
              name: pr.name,
              total: totals.get(pr.customer_id as string) || 0,
            }))
            .filter((r) => r.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
          setTopRevenue(ranked);
        } else {
          setTopRevenue([]);
        }
      } else {
        setTopRevenue([]);
      }
    } catch (e: any) {
      toast({ title: "Erro ao carregar análise", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeOrg?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // KPIs
  const totalPartners = partners.length;
  const activePartners = partners.filter((p) => p.status === "active").length;
  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const today = new Date();
  const in60 = new Date();
  in60.setDate(today.getDate() + 60);
  const expiringSoon = contracts
    .filter(
      (c) =>
        c.status === "active" &&
        c.end_date &&
        new Date(c.end_date) >= new Date(today.toDateString()) &&
        new Date(c.end_date) <= in60
    )
    .sort((a, b) => (a.end_date! < b.end_date! ? -1 : 1));

  // Por estado
  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of partners) map.set(p.status, (map.get(p.status) || 0) + 1);
    return Array.from(map.entries()).map(([key, count]) => ({
      key,
      name: STATUS_LABEL[key] ?? key,
      count,
    }));
  }, [partners]);

  // Por tipo
  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of partners) map.set(p.type, (map.get(p.type) || 0) + 1);
    return Array.from(map.entries()).map(([key, count]) => ({
      key,
      name: TYPE_LABEL[key] ?? key,
      count,
    }));
  }, [partners]);

  // Por região
  const byRegion = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of partners) {
      const key = (p.region || "").trim() || "Sem região";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [partners]);

  // Contratos por estado
  const contractsByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contracts) map.set(c.status, (map.get(c.status) || 0) + 1);
    return ["draft", "active", "expired", "terminated"].map((k) => ({
      key: k,
      name: CONTRACT_STATUS_LABEL[k],
      count: map.get(k) || 0,
    }));
  }, [contracts]);

  const partnersById = useMemo(() => {
    const m = new Map<string, Partner>();
    for (const p of partners) m.set(p.id, p);
    return m;
  }, [partners]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Análise de distribuição"
          description="Visão geral de parceiros, contratos e cobertura."
          icon={<BarChart3 className="h-6 w-6" />}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (partners.length === 0 && contracts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Análise de distribuição"
          description="Visão geral de parceiros, contratos e cobertura."
          icon={<BarChart3 className="h-6 w-6" />}
        />
        <EmptyState
          icon={<Store className="h-8 w-8" />}
          title="Sem dados ainda"
          description="Adiciona parceiros e contratos para veres a análise aqui."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Análise de distribuição"
        description="Visão geral de parceiros, contratos e cobertura."
        icon={<BarChart3 className="h-6 w-6" />}
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Store className="h-4 w-4" />} label="Total de parceiros" value={totalPartners} />
        <KpiCard
          icon={<Store className="h-4 w-4" />}
          label="Parceiros ativos"
          value={activePartners}
        />
        <KpiCard
          icon={<FileText className="h-4 w-4" />}
          label="Contratos ativos"
          value={activeContracts}
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="A expirar (60 dias)"
          value={expiringSoon.length}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parceiros por estado</CardTitle>
          </CardHeader>
          <CardContent>
            {byStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={byStatus}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {byStatus.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parceiros por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            {byType.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byType}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cobertura por região</CardTitle>
        </CardHeader>
        <CardContent>
          {byRegion.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <ResponsiveContainer width="100%" height={Math.max(220, byRegion.length * 28)}>
                <BarChart data={byRegion} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Região</TableHead>
                    <TableHead className="text-right">Parceiros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byRegion.map((r) => (
                    <TableRow key={r.name}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right font-medium">{r.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contratos por estado</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={contractsByStatus}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contratos a expirar (próx. 60 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            {expiringSoon.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contrato a expirar.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parceiro</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="text-right">Fim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiringSoon.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{partnersById.get(c.partner_id)?.name ?? "—"}</TableCell>
                      <TableCell>{c.title}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">{c.end_date}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Top parceiros por receita
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topRevenue.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem dados de receita. Liga parceiros a clientes para ver esta análise.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Parceiro</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topRevenue.map((r, i) => (
                  <TableRow key={`${r.name}-${i}`}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{fmt.format(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          <span>{label}</span>
        </div>
        <div className="mt-2 text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}