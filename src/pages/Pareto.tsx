import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
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

type Mode = "customers" | "products";
type Preset = "last_30" | "last_90" | "this_year" | "last_12";

type Row = {
  id: string;
  name: string;
  value: number;
  pct: number;
  cumulative_pct: number;
  abc: "A" | "B" | "C";
};

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeFor(preset: Preset): { from: string; to: string } {
  const now = new Date();
  if (preset === "last_30") {
    const from = new Date(now); from.setDate(now.getDate() - 29);
    return { from: isoDate(from), to: isoDate(now) };
  }
  if (preset === "last_90") {
    const from = new Date(now); from.setDate(now.getDate() - 89);
    return { from: isoDate(from), to: isoDate(now) };
  }
  if (preset === "this_year") {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  const to = now;
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return { from: isoDate(from), to: isoDate(to) };
}

const PRESETS: { v: Preset; l: string }[] = [
  { v: "last_30", l: "Últimos 30 dias" },
  { v: "last_90", l: "Últimos 90 dias" },
  { v: "this_year", l: "Este ano" },
  { v: "last_12", l: "Últimos 12 meses" },
];

function fmtMoney(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

function classifyABC(cumPct: number): "A" | "B" | "C" {
  if (cumPct <= 0.8) return "A";
  if (cumPct <= 0.95) return "B";
  return "C";
}

export default function Pareto() {
  const { activeOrg } = useOrganization();
  const currency = activeOrg?.currency ?? "EUR";
  const [mode, setMode] = useState<Mode>("customers");
  const [preset, setPreset] = useState<Preset>("last_90");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const fetchData = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { from, to } = rangeFor(preset);
    try {
      if (mode === "customers") {
        const { data, error } = await supabase.rpc("get_top_customers", {
          _org_id: activeOrg.id, _from: from, _to: to, _limit: 1000,
        });
        if (error) throw error;
        const items = (data ?? []).map((r: any) => ({
          id: r.customer_id ?? crypto.randomUUID(),
          name: r.customer_name ?? "—",
          value: Number(r.total ?? 0),
        })).filter((r: any) => r.value > 0);
        const total = items.reduce((s: number, r: any) => s + r.value, 0) || 1;
        let cum = 0;
        const out: Row[] = items.map((r: any) => {
          const pct = r.value / total;
          cum += pct;
          return { ...r, pct, cumulative_pct: cum, abc: classifyABC(cum) };
        });
        setRows(out);
      } else {
        const { data, error } = await supabase.rpc("get_top_products", {
          _org_id: activeOrg.id, _from: from, _to: to, _limit: 1000,
        });
        if (error) throw error;
        const out: Row[] = (data ?? []).map((r: any) => ({
          id: r.product_id ?? crypto.randomUUID(),
          name: r.product_name ?? "—",
          value: Number(r.revenue ?? 0),
          pct: Number(r.pct ?? 0),
          cumulative_pct: Number(r.cumulative_pct ?? 0),
          abc: (r.abc_class ?? "C") as "A" | "B" | "C",
        })).filter((r) => r.value > 0);
        setRows(out);
      }
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erro a carregar dados", description: e.message ?? String(e), variant: "destructive" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeOrg, mode, preset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartData = useMemo(
    () => rows.slice(0, 25).map((r) => ({
      name: r.name.length > 18 ? r.name.slice(0, 17) + "…" : r.name,
      value: Number(r.value.toFixed(2)),
      cumulative: Number((r.cumulative_pct * 100).toFixed(2)),
    })),
    [rows]
  );

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.value, 0);
    const counts = { A: 0, B: 0, C: 0 } as Record<"A" | "B" | "C", number>;
    rows.forEach((r) => { counts[r.abc] += 1; });
    return { total, counts };
  }, [rows]);

  return (
    <div className="p-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Análise de Pareto</h1>
          <p className="text-sm text-muted-foreground">Regra 80/20 aplicada a clientes ou produtos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-tour="pareto-filters">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="customers">Clientes</TabsTrigger>
              <TabsTrigger value="products">Produtos</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3" data-tour="pareto-kpis">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{fmtMoney(totals.total, currency)}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Itens classe A</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{totals.counts.A}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Itens classe B</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{totals.counts.B}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Itens classe C</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{totals.counts.C}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Curva de Pareto (top 25)</CardTitle></CardHeader>
        <CardContent className="h-[360px]" data-tour="pareto-chart">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">A carregar…</div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados para o período</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: any, key: any) => key === "cumulative" ? [`${val}%`, "% acumulada"] : [fmtMoney(Number(val), currency), "Valor"]}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="value" name="Valor" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="cumulative" name="% acumulada" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Detalhe</CardTitle></CardHeader>
        <CardContent className="p-0" data-tour="pareto-table">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">A carregar…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Sem dados.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>{mode === "customers" ? "Cliente" : "Produto"}</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">% individual</TableHead>
                  <TableHead className="text-right">% acumulada</TableHead>
                  <TableHead className="text-center">Classe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{fmtMoney(r.value, currency)}</TableCell>
                    <TableCell className="text-right">{(r.pct * 100).toFixed(2)}%</TableCell>
                    <TableCell className="text-right">{(r.cumulative_pct * 100).toFixed(2)}%</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={r.abc === "A" ? "default" : r.abc === "B" ? "secondary" : "outline"}>{r.abc}</Badge>
                    </TableCell>
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