import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlarmClock, PhoneOff, Flame, RefreshCw, MessageCircle, CalendarClock, Repeat, Clock, FileText } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import DashboardObjectives from "@/components/dashboard/DashboardObjectives";
import SetupChecklist from "@/components/SetupChecklist";

type Preset = "this_month" | "last_month" | "this_year" | "last_12";

type Summary = {
  faturado: number;
  vendas: number;
  por_faturar: number;
  por_faturar_sem_iva: number;
  vendas_sem_iva: number;
  num_orders: number;
  ticket_medio: number;
  clientes_ativos: number;
  pipeline_aberto: number;
  taxa_conversao: number;
};

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function isoDate(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeFor(preset: Preset): { from: string; to: string; months: number } {
  const now = new Date();
  if (preset === "this_month") {
    return { from: isoDate(startOfMonth(now)), to: isoDate(endOfMonth(now)), months: 6 };
  }
  if (preset === "last_month") {
    const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: isoDate(startOfMonth(ref)), to: isoDate(endOfMonth(ref)), months: 6 };
  }
  if (preset === "this_year") {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31`, months: 12 };
  }
  // last_12
  const to = endOfMonth(now);
  const from = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1));
  return { from: isoDate(from), to: isoDate(to), months: 12 };
}

const PRESETS: { v: Preset; l: string }[] = [
  { v: "this_month", l: "Este mês" },
  { v: "last_month", l: "Mês passado" },
  { v: "this_year", l: "Este ano" },
  { v: "last_12",   l: "Últimos 12 meses" },
];

export default function Dashboard() {
  const { activeOrg, role, isAdmin } = useOrganization();
  const currency = activeOrg?.currency || "EUR";
  const fmtMoney = useMemo(() => (v: number) => {
    try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 0 }).format(v ?? 0); }
    catch { return `${(v ?? 0).toFixed(2)} ${currency}`; }
  }, [currency]);
  const fmtMoneyFull = useMemo(() => (v: number) => {
    try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v ?? 0); }
    catch { return `${(v ?? 0).toFixed(2)} ${currency}`; }
  }, [currency]);
  const fmtPct = (v: number) => `${(Number(v ?? 0) * 100).toFixed(1)}%`;

  const canSeeTeam = isAdmin || role === "sales_director";

  const [preset, setPreset] = useState<Preset>("this_month");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [evolution, setEvolution] = useState<{ month: string; faturado: number; vendas: number }[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [nudges, setNudges] = useState<any[]>([]);
  const [nudgesLoading, setNudgesLoading] = useState(false);
  const navigate = useNavigate();

  const loadNudges = useCallback(async () => {
    if (!activeOrg) return;
    const { data, error } = await supabase
      .from("ai_nudges" as any)
      .select("id, type, priority, title, body, entity_type, entity_id, created_at")
      .eq("organization_id", activeOrg.id)
      .eq("status", "new")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast({ title: "Erro a carregar sugestões", description: error.message, variant: "destructive" });
      return;
    }
    const prio = (p: string) => (p === "urgent" ? 0 : p === "high" ? 1 : 2);
    const sorted = ((data as any[]) ?? []).sort((a, b) => {
      const d = prio(a.priority) - prio(b.priority);
      if (d !== 0) return d;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    }).slice(0, 6);
    setNudges(sorted);
  }, [activeOrg]);

  useEffect(() => { loadNudges(); }, [loadNudges]);

  const refreshNudges = async () => {
    if (!activeOrg) return;
    setNudgesLoading(true);
    try {
      const { error } = await supabase.rpc("refresh_org_nudges" as any, { _org_id: activeOrg.id });
      if (error) throw error;
      await loadNudges();
      toast({ title: "Sugestões atualizadas" });
    } catch (e: any) {
      toast({ title: "Erro a atualizar sugestões", description: e.message, variant: "destructive" });
    } finally {
      setNudgesLoading(false);
    }
  };

  const dismissNudge = async (id: string) => {
    const { error } = await supabase
      .from("ai_nudges" as any)
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setNudges((prev) => prev.filter((n) => n.id !== id));
  };

  const openEntity = (n: any) => {
    if (n.entity_type === "customer") navigate(`/app/customers${n.entity_id ? `?id=${n.entity_id}` : ""}`);
    else if (n.entity_type === "prospect") navigate(`/app/prospects${n.entity_id ? `?id=${n.entity_id}` : ""}`);
    else if (n.entity_type === "activity") navigate(`/app/calendar`);
    else if (n.entity_type === "order") navigate(`/app/orders`);
  };

  const askAgent = (n: any) => {
    const prompt = `Tenho esta sugestão no meu painel: "${n.title}".${n.body ? ` Contexto: ${n.body}` : ""}\n\nQue próximos passos concretos me recomendas?`;
    navigate("/app/agents", { state: { prompt, agent: "sales" } });
  };

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { from, to, months } = rangeFor(preset);
    try {
      const [sumRes, evoRes, custRes, prodRes] = await Promise.all([
        supabase.rpc("get_dashboard_summary" as any, { _org_id: activeOrg.id, _from: from, _to: to }),
        supabase.rpc("get_sales_evolution" as any, { _org_id: activeOrg.id, _months: months }),
        supabase.rpc("get_top_customers" as any, { _org_id: activeOrg.id, _from: from, _to: to, _limit: 10 }),
        supabase.rpc("get_top_products" as any, { _org_id: activeOrg.id, _from: from, _to: to, _limit: 20 }),
      ]);
      if (sumRes.error) throw sumRes.error;
      if (evoRes.error) throw evoRes.error;
      if (custRes.error) throw custRes.error;
      if (prodRes.error) throw prodRes.error;

      setSummary(sumRes.data as Summary);
      setEvolution(((evoRes.data as any[]) ?? []).map((r) => ({
        month: new Date(r.month_start).toLocaleDateString("pt-PT", { month: "short", year: "2-digit" }),
        faturado: Number(r.faturado ?? 0),
        vendas: Number(r.vendas ?? 0),
      })));
      setTopCustomers((custRes.data as any[]) ?? []);
      setTopProducts((prodRes.data as any[]) ?? []);

      if (canSeeTeam) {
        const teamRes = await supabase.rpc("get_team_ranking" as any, {
          _org_id: activeOrg.id, _from: from, _to: to,
        });
        if (teamRes.error) throw teamRes.error;
        setTeam((teamRes.data as any[]) ?? []);
      } else {
        setTeam([]);
      }
    } catch (e: any) {
      toast({ title: "Erro a carregar dashboard", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeOrg, preset, canSeeTeam]);

  useEffect(() => { load(); }, [load]);

  const kpis: { l: string; v: string; sub?: string }[] = [
    { l: "Faturado",         v: summary ? fmtMoneyFull(summary.faturado) : "—" },
    { l: "Por faturar (c/IVA)", v: summary ? fmtMoneyFull(summary.por_faturar) : "—",
      sub: summary ? `S/IVA: ${fmtMoneyFull(summary.por_faturar_sem_iva)}` : undefined },
    { l: "Vendas",           v: summary ? fmtMoneyFull(summary.vendas) : "—",
      sub: summary ? `S/IVA: ${fmtMoneyFull(summary.vendas_sem_iva)}` : undefined },
    { l: "Nº de encomendas", v: summary ? String(summary.num_orders) : "—" },
    { l: "Ticket médio",     v: summary ? fmtMoneyFull(summary.ticket_medio) : "—" },
    { l: "Clientes ativos",  v: summary ? String(summary.clientes_ativos) : "—" },
    { l: "Pipeline em aberto", v: summary ? fmtMoneyFull(summary.pipeline_aberto) : "—" },
    { l: "Taxa de conversão",  v: summary ? fmtPct(summary.taxa_conversao) : "—" },
  ];

  const noEvolution = evolution.every((p) => p.faturado === 0 && p.vendas === 0);

  return (
    <div className="space-y-6">
      <SetupChecklist />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Painel</h1>
          <p className="text-sm text-muted-foreground">Visão geral do negócio · {activeOrg?.name}</p>
        </div>
        <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.l}>
            <CardContent className="p-4 space-y-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.l}</div>
              <div className="font-display text-2xl font-semibold">{loading && !summary ? "…" : k.v}</div>
              {k.sub && !(loading && !summary) ? (
                <div className="text-xs text-muted-foreground">{k.sub}</div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <DashboardObjectives />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Sugestões do dia</CardTitle>
          <Button variant="outline" size="sm" onClick={refreshNudges} disabled={nudgesLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${nudgesLoading ? "animate-spin" : ""}`} />
            Atualizar sugestões
          </Button>
        </CardHeader>
        <CardContent>
          {nudges.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Sem sugestões para hoje. Bom trabalho! 🎉
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {nudges.map((n) => {
                const Icon = n.type === "purchase_overdue" ? AlarmClock
                          : n.type === "no_contact" ? PhoneOff
                          : n.type === "agenda_reminder" ? CalendarClock
                          : n.type === "subscription_due" ? Repeat
                          : n.type === "prospect_idle" ? Clock
                          : n.type === "proposal_pending" ? FileText
                          : n.type === "close_date_due" ? CalendarClock
                          : Flame;
                const prioClass = n.priority === "urgent"
                  ? "bg-red-500/15 text-red-700 dark:text-red-300"
                  : n.priority === "high"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-muted text-muted-foreground";
                return (
                  <div key={n.id} className="rounded-lg border p-3 space-y-2 bg-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="font-medium text-sm leading-tight">{n.title}</div>
                      </div>
                      <Badge variant="secondary" className={prioClass}>
                        {n.priority === "urgent" ? "Urgente" : n.priority === "high" ? "Alta" : "Normal"}
                      </Badge>
                    </div>
                    {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                    <div className="flex items-center gap-2 pt-1">
                      {n.entity_type && (
                        <Button size="sm" variant="outline" onClick={() => openEntity(n)}>Ver</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => dismissNudge(n.id)}>Dispensar</Button>
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => askAgent(n)}>
                        <MessageCircle className="h-3.5 w-3.5 mr-1" />
                        Perguntar ao Agente
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Evolução mensal</CardTitle></CardHeader>
        <CardContent>
          {evolution.length === 0 || noEvolution ? (
            <div className="text-sm text-muted-foreground py-10 text-center">Sem dados no período.</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolution} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => fmtMoney(Number(v))} width={80} />
                  <Tooltip formatter={(v: any) => fmtMoneyFull(Number(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="vendas"   name="Vendas"   stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="faturado" name="Faturado" stroke="hsl(var(--primary))"         strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top clientes</CardTitle></CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Sem clientes no período.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Encomendas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map((r) => (
                    <TableRow key={r.customer_id ?? r.customer_name}>
                      <TableCell className="font-medium">{r.customer_name}</TableCell>
                      <TableCell className="text-right">{r.num_orders}</TableCell>
                      <TableCell className="text-right">{fmtMoneyFull(Number(r.total))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top produtos (ABC / Pareto)</CardTitle></CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Sem produtos no período.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">% acum.</TableHead>
                    <TableHead className="text-center">Classe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((r) => {
                    const cls = r.abc_class === "A"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : r.abc_class === "B"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      : "bg-muted text-muted-foreground";
                    return (
                      <TableRow key={(r.product_id ?? r.product_name) + r.product_name}>
                        <TableCell className="font-medium">{r.product_name}</TableCell>
                        <TableCell className="text-right">{Number(r.quantity).toLocaleString("pt-PT")}</TableCell>
                        <TableCell className="text-right">{fmtMoneyFull(Number(r.revenue))}</TableCell>
                        <TableCell className="text-right">{(Number(r.pct) * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{(Number(r.cumulative_pct) * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-center"><Badge variant="secondary" className={cls}>{r.abc_class}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {canSeeTeam && (
        <Card>
          <CardHeader><CardTitle>Ranking da equipa</CardTitle></CardHeader>
          <CardContent>
            {team.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Sem encomendas atribuídas no período.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Comercial</TableHead>
                    <TableHead className="text-right">Encomendas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.map((r, i) => (
                    <TableRow key={r.member_id ?? `n-${i}`}>
                      <TableCell className="font-medium">
                        {(activeOrg as { rankings_hide_names?: boolean })?.rankings_hide_names && !isAdmin
                          ? `Comercial #${i + 1}`
                          : (r.member_name ?? "Sem comercial")}
                      </TableCell>
                      <TableCell className="text-right">{r.num_orders}</TableCell>
                      <TableCell className="text-right">{fmtMoneyFull(Number(r.total))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}