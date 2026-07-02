import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, X } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Preset = "last_30" | "last_90" | "this_year" | "last_12";
type Metric = "revenue" | "quantity" | "unit_price";

type ProductLite = {
  id: string;
  name: string;
  sku: string | null;
  unit_price: number;
  currency: string;
};

type ProductMetrics = ProductLite & {
  quantity: number;
  revenue: number;
  num_orders: number;
};

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function rangeFor(preset: Preset): { from: string; to: string } {
  const now = new Date();
  if (preset === "last_30") { const f = new Date(now); f.setDate(now.getDate() - 29); return { from: isoDate(f), to: isoDate(now) }; }
  if (preset === "last_90") { const f = new Date(now); f.setDate(now.getDate() - 89); return { from: isoDate(f), to: isoDate(now) }; }
  if (preset === "this_year") { return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` }; }
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return { from: isoDate(from), to: isoDate(now) };
}
const PRESETS: { v: Preset; l: string }[] = [
  { v: "last_30", l: "Últimos 30 dias" },
  { v: "last_90", l: "Últimos 90 dias" },
  { v: "this_year", l: "Este ano" },
  { v: "last_12", l: "Últimos 12 meses" },
];
const METRICS: { v: Metric; l: string }[] = [
  { v: "revenue", l: "Receita" },
  { v: "quantity", l: "Unidades vendidas" },
  { v: "unit_price", l: "Preço unitário" },
];

function fmtMoney(v: number, currency: string) {
  try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v); }
  catch { return `${v.toFixed(2)} ${currency}`; }
}

export default function ProductComparison() {
  const { activeOrg } = useOrganization();
  const currency = activeOrg?.currency ?? "EUR";
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProductMetrics[]>([]);
  const [preset, setPreset] = useState<Preset>("last_90");
  const [metric, setMetric] = useState<Metric>("revenue");
  const [loading, setLoading] = useState(false);

  // search debounce
  useEffect(() => {
    if (!activeOrg) return;
    const q = query.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const handle = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,unit_price,currency")
        .eq("organization_id", activeOrg.id)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .order("name")
        .limit(15);
      setSearching(false);
      if (error) {
        console.error(error);
        return;
      }
      setSearchResults((data ?? []) as ProductLite[]);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, activeOrg]);

  const fetchMetricsFor = useCallback(async (products: ProductLite[]) => {
    if (!activeOrg || products.length === 0) return [] as ProductMetrics[];
    const { from, to } = rangeFor(preset);
    const ids = products.map((p) => p.id);
    const { data, error } = await supabase
      .from("order_lines")
      .select("product_id, quantity, line_total, order_id, orders!inner(order_date, status, organization_id)")
      .eq("organization_id", activeOrg.id)
      .in("product_id", ids)
      .gte("orders.order_date", from)
      .lte("orders.order_date", to)
      .neq("orders.status", "cancelada");
    if (error) throw error;
    const agg = new Map<string, { qty: number; rev: number; orders: Set<string> }>();
    (data ?? []).forEach((row: any) => {
      const pid = row.product_id;
      if (!pid) return;
      const cur = agg.get(pid) ?? { qty: 0, rev: 0, orders: new Set<string>() };
      cur.qty += Number(row.quantity ?? 0);
      cur.rev += Number(row.line_total ?? 0);
      if (row.order_id) cur.orders.add(row.order_id);
      agg.set(pid, cur);
    });
    return products.map((p) => {
      const a = agg.get(p.id);
      return {
        ...p,
        quantity: a?.qty ?? 0,
        revenue: a?.rev ?? 0,
        num_orders: a?.orders.size ?? 0,
      };
    });
  }, [activeOrg, preset]);

  // refresh metrics when period changes
  useEffect(() => {
    if (selected.length === 0) return;
    let cancelled = false;
    setLoading(true);
    fetchMetricsFor(selected).then((res) => {
      if (!cancelled) setSelected(res);
    }).catch((e) => {
      console.error(e);
      toast({ title: "Erro a carregar métricas", description: e.message ?? String(e), variant: "destructive" });
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, activeOrg?.id]);

  const addProduct = async (p: ProductLite) => {
    if (selected.find((s) => s.id === p.id)) {
      toast({ title: "Já está na comparação" });
      return;
    }
    setLoading(true);
    try {
      const enriched = await fetchMetricsFor([p]);
      setSelected((prev) => [...prev, ...enriched]);
      setQuery("");
      setSearchResults([]);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const removeProduct = (id: string) => setSelected((prev) => prev.filter((p) => p.id !== id));

  const chartData = useMemo(() => selected.map((p) => ({
    name: p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name,
    revenue: Number(p.revenue.toFixed(2)),
    quantity: Number(p.quantity.toFixed(2)),
    unit_price: Number(Number(p.unit_price ?? 0).toFixed(2)),
  })), [selected]);

  const metricLabel = METRICS.find((m) => m.v === metric)?.l ?? "";

  return (
    <div className="p-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Comparar Produtos</h1>
          <p className="text-sm text-muted-foreground">Compara preço, unidades vendidas e receita por produto</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (<SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <Card data-tour="product-comparison-search">
        <CardHeader><CardTitle className="text-base">Adicionar produto</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar por nome ou código (SKU)…"
              className="pl-9"
            />
          </div>
          {query.trim().length >= 2 && (
            <div className="border rounded-md divide-y max-h-72 overflow-auto">
              {searching ? (
                <div className="p-3 text-sm text-muted-foreground">A pesquisar…</div>
              ) : searchResults.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">Sem resultados</div>
              ) : (
                searchResults.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2 hover:bg-muted/40">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.sku ?? "—"} · {fmtMoney(Number(p.unit_price ?? 0), p.currency || currency)}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => addProduct(p)} disabled={loading}>
                      <Plus className="h-4 w-4 mr-1" /> Adicionar
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Comparação ({selected.length})</CardTitle>
          {selected.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Métrica do gráfico:</span>
              <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METRICS.map((m) => (<SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0" data-tour="product-comparison-table">
          {selected.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Adiciona produtos acima para começar a comparar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Encomendas</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.sku ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right">{fmtMoney(Number(p.unit_price ?? 0), p.currency || currency)}</TableCell>
                    <TableCell className="text-right">{p.quantity.toLocaleString("pt-PT")}</TableCell>
                    <TableCell className="text-right">{fmtMoney(p.revenue, currency)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{p.num_orders}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => removeProduct(p.id)} aria-label="Remover">
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected.length > 0 && (
        <Card data-tour="product-comparison-chart">
          <CardHeader><CardTitle className="text-base">Gráfico — {metricLabel}</CardTitle></CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val: any) =>
                    metric === "quantity" ? [Number(val).toLocaleString("pt-PT"), metricLabel]
                                          : [fmtMoney(Number(val), currency), metricLabel]
                  }
                />
                <Legend />
                <Bar dataKey={metric} name={metricLabel} fill="hsl(var(--primary))" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}