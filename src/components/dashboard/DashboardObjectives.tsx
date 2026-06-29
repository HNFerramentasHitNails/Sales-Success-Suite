import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Link } from "react-router-dom";
import { Target } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Row = { month: number; target: number; actual: number; actual_prev: number };
type Attain = { member_id: string; member_name: string; meta: number; realizado: number; pct: number | null };
const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function DashboardObjectives() {
  const { activeOrg, role, isAdmin } = useOrganization();
  const canSeeTeam = isAdmin || role === "sales_director";
  const currency = activeOrg?.currency || "EUR";
  const year = new Date().getFullYear();

  const fmt = (v: number) => { try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 0 }).format(v || 0); } catch { return `${(v || 0).toFixed(0)} ${currency}`; } };
  const fmtFull = (v: number) => { try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v || 0); } catch { return `${(v || 0).toFixed(2)} ${currency}`; } };

  const [metric, setMetric] = useState<"vendas" | "faturado">("vendas");
  const [rows, setRows] = useState<Row[]>([]);
  const [attain, setAttain] = useState<Attain[]>([]);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    try {
      const { data, error } = await supabase.rpc("get_objective_progress" as any, { _org_id: activeOrg.id, _year: year, _member_id: null, _metric: metric });
      if (error) throw error;
      const r = ((data as any[]) ?? []).map((x) => ({ month: Number(x.month), target: Number(x.target || 0), actual: Number(x.actual || 0), actual_prev: Number(x.actual_prev || 0) })) as Row[];
      const byM = new Map(r.map((x) => [x.month, x]));
      setRows(Array.from({ length: 12 }, (_, i) => byM.get(i + 1) ?? { month: i + 1, target: 0, actual: 0, actual_prev: 0 }));
      if (canSeeTeam) {
        const { data: a, error: ae } = await supabase.rpc("get_team_objective_attainment" as any, { _org_id: activeOrg.id, _year: year, _metric: metric });
        if (ae) throw ae;
        setAttain(((a as any[]) ?? []).map((x) => ({ member_id: x.member_id, member_name: x.member_name, meta: Number(x.meta || 0), realizado: Number(x.realizado || 0), pct: x.pct === null ? null : Number(x.pct) })));
      } else {
        setAttain([]);
      }
    } catch (e: any) {
      toast({ title: "Erro a carregar objetivos", description: e.message, variant: "destructive" });
    }
  }, [activeOrg, metric, canSeeTeam, year]);

  useEffect(() => { load(); }, [load]);

  const metaAnual = useMemo(() => rows.reduce((s, r) => s + r.target, 0), [rows]);
  const realizado = useMemo(() => rows.reduce((s, r) => s + r.actual, 0), [rows]);
  const realizadoPrev = useMemo(() => rows.reduce((s, r) => s + r.actual_prev, 0), [rows]);
  const pct = metaAnual > 0 ? realizado / metaAnual : 0;
  const yoy = realizadoPrev > 0 ? (realizado - realizadoPrev) / realizadoPrev : null;
  const chartData = rows.map((r, i) => ({ name: MONTHS[i], Meta: r.target, Realizado: r.actual, "Ano anterior": r.actual_prev }));

  const hasAnyObjective = metaAnual > 0 || attain.some((a) => a.meta > 0);
  if (!hasAnyObjective) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Objetivo da empresa · {year}</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={metric} onValueChange={(v) => setMetric(v as "vendas" | "faturado")}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vendas">Vendas (encomendas)</SelectItem>
                <SelectItem value="faturado">Faturado (faturas)</SelectItem>
              </SelectContent>
            </Select>
            <Link to="/app/objectives"><Button variant="outline" size="sm">Gerir objetivos</Button></Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Meta anual</div><div className="font-display text-2xl font-semibold">{fmtFull(metaAnual)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Realizado (líq.)</div><div className="font-display text-2xl font-semibold">{fmtFull(realizado)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Cumprimento</div><div className="font-display text-2xl font-semibold">{metaAnual > 0 ? `${(pct * 100).toFixed(1)}%` : "—"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">vs ano anterior</div><div className="font-display text-2xl font-semibold">{yoy === null ? "—" : `${yoy >= 0 ? "+" : ""}${(yoy * 100).toFixed(1)}%`}</div></div>
          </div>
          {metaAnual > 0 && <Progress value={Math.min(100, pct * 100)} />}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => fmt(Number(v))} width={80} />
                <Tooltip formatter={(v: any) => fmtFull(Number(v))} />
                <Legend />
                <Bar dataKey="Meta" fill="hsl(var(--muted-foreground))" fillOpacity={0.35} />
                <Bar dataKey="Realizado" fill="hsl(var(--primary))" />
                <Line type="monotone" dataKey="Ano anterior" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">Valores líquidos (S/IVA).</p>
        </CardContent>
      </Card>

      {canSeeTeam && attain.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Cumprimento por comercial · {year}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Comercial</TableHead>
                  <TableHead className="text-right">Meta</TableHead>
                  <TableHead className="text-right">Realizado</TableHead>
                  <TableHead className="w-48">Cumprimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attain.map((a) => (
                  <TableRow key={a.member_id}>
                    <TableCell className="font-medium">{a.member_name}</TableCell>
                    <TableCell className="text-right">{a.meta > 0 ? fmtFull(a.meta) : "—"}</TableCell>
                    <TableCell className="text-right">{fmtFull(a.realizado)}</TableCell>
                    <TableCell>
                      {a.pct === null ? (
                        <span className="text-xs text-muted-foreground">Sem meta</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(100, a.pct * 100)} className="flex-1" />
                          <span className="text-xs tabular-nums w-12 text-right">{(a.pct * 100).toFixed(0)}%</span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}