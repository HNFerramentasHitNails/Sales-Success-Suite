import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Exception = { category: string; severity: string; entity: string; detail: string; amount: number | null };
type Margins = { revenue: number; cogs: number; margin: number; margin_pct: number; orders_count: number };
type Inventory = { total_cost: number; total_units: number; products_count: number };

function fmtMoney(v: number, currency = "EUR") {
  try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v); }
  catch { return `${(v ?? 0).toFixed(2)} ${currency}`; }
}

const SEV_VARIANT: Record<string, "destructive" | "secondary" | "outline"> = {
  critica: "destructive", alta: "destructive", media: "secondary", baixa: "outline",
};
const SEV_LABEL: Record<string, string> = { critica: "Crítica", alta: "Alta", media: "Média", baixa: "Baixa" };
const SEV_ORDER: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };

const CATEGORY_LABEL: Record<string, string> = {
  cabecalho_vs_linhas: "Cabeçalho ≠ soma das linhas",
  faturada_sem_fatura: "Encomenda faturada sem fatura",
  fatura_orfa: "Fatura órfã",
  fatura_total_divergente: "Total da fatura divergente",
  fatura_nao_certificada: "Fatura não certificada (AT)",
  saldo_carteira_divergente: "Saldo de carteira divergente",
  carteira_aplicada_sem_debito: "Carteira aplicada sem débito",
  rma_por_regularizar: "Devolução por regularizar",
  comissoes_por_gerar: "Comissões por gerar",
  stock_divergente: "Stock divergente",
  pagamento_pago_sem_data: "Pago sem data",
  pagamento_faturada_com_ref_stripe_sem_paid_at: "Faturada c/ ref Stripe sem pagamento",
  pagamento_faturada_sem_pagamento: "Faturada sem pagamento",
};

function periodRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "last_month") return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  if (preset === "this_year") return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
  return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }; // this_month
}

export default function Reconciliation() {
  const { activeOrg } = useOrganization();
  const currency = activeOrg?.currency || "EUR";
  const [loading, setLoading] = useState(false);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [margins, setMargins] = useState<Margins | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [preset, setPreset] = useState("this_month");

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { from, to } = periodRange(preset);
    const [exc, mar, inv] = await Promise.all([
      supabase.rpc("get_financial_exceptions" as any, { _org: activeOrg.id }),
      supabase.rpc("get_financial_margins" as any, { _org: activeOrg.id, _from: from, _to: to }),
      supabase.rpc("get_inventory_valuation" as any, { _org: activeOrg.id }),
    ]);
    if (exc.error) toast({ title: "Erro a carregar exceções", description: exc.error.message, variant: "destructive" });
    setExceptions(((exc.data ?? []) as Exception[]).filter((e) => e.category));
    setMargins(((mar.data ?? [])[0] as Margins) ?? null);
    setInventory(((inv.data ?? [])[0] as Inventory) ?? null);
    setLoading(false);
  }, [activeOrg, preset]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(
    () => [...exceptions].sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)),
    [exceptions],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of exceptions) c[e.severity] = (c[e.severity] ?? 0) + 1;
    return c;
  }, [exceptions]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conciliação financeira"
        description="Tie-outs automáticos: integridade encomenda↔fatura, faturação certificada, carteira, devoluções, stock, comissões e pagamentos."
        icon={<ShieldCheck className="h-6 w-6" />}
        actions={<Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Atualizar
        </Button>}
      />

      {/* KPIs de margem e inventário */}
      <div className="grid gap-3 md:grid-cols-4" data-tour="reconciliation-kpis">
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Margem</CardTitle>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">Este mês</SelectItem>
                <SelectItem value="last_month">Mês passado</SelectItem>
                <SelectItem value="this_year">Este ano</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{margins ? fmtMoney(margins.margin, currency) : "—"}</div>
            <div className="text-xs text-muted-foreground">{margins ? `${margins.margin_pct}% sobre receita` : ""}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Receita (líquida)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{margins ? fmtMoney(margins.revenue, currency) : "—"}</div>
            <div className="text-xs text-muted-foreground">{margins ? `${margins.orders_count} encomendas` : ""}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">COGS</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{margins ? fmtMoney(margins.cogs, currency) : "—"}</div>
            <div className="text-xs text-muted-foreground">custo das vendas</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Inventário ao custo</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inventory ? fmtMoney(inventory.total_cost, currency) : "—"}</div>
            <div className="text-xs text-muted-foreground">{inventory ? `${inventory.total_units} un. · ${inventory.products_count} produtos` : ""}</div>
          </CardContent>
        </Card>
      </div>

      {/* Exceções */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Exceções financeiras
          </CardTitle>
          <div className="flex gap-1.5">
            {(["critica", "alta", "media", "baixa"] as const).map((s) => counts[s] ? (
              <Badge key={s} variant={SEV_VARIANT[s]}>{counts[s]} {SEV_LABEL[s]}</Badge>
            ) : null)}
          </div>
        </CardHeader>
        <CardContent className="p-0" data-tour="reconciliation-exceptions">
          {loading ? (
            <div className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
              <ShieldCheck className="h-8 w-8 text-green-500" />
              Sem exceções. Tudo concilia.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gravidade</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead>Detalhe</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell><Badge variant={SEV_VARIANT[e.severity] ?? "outline"}>{SEV_LABEL[e.severity] ?? e.severity}</Badge></TableCell>
                    <TableCell className="font-medium">{CATEGORY_LABEL[e.category] ?? e.category}</TableCell>
                    <TableCell className="text-sm">{e.entity}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-md">{e.detail}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.amount != null ? fmtMoney(Number(e.amount), currency) : "—"}</TableCell>
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
