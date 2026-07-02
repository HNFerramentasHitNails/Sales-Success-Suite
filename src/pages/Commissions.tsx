import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, CheckCircle2, Lock } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Preset = "this_month" | "last_month" | "this_year";
type Applies = "all" | "product" | "category" | "member";

type Summary = { member_id: string | null; member_name: string; base_total: number; commission_total: number; num_orders: number };
type Detail  = { line_id: string; order_id: string; order_number: string; order_date: string; product_name: string; base: number; rate_percent: number; commission: number };
type ByProduct = { product_id: string | null; product_name: string; category: string | null; base_total: number; commission_total: number; num_lines: number };
type Adjustment = {
  id: string;
  member_id: string;
  period_start: string;
  period_end: string;
  label: string;
  amount: number;
  notes: string | null;
};
type Rule = {
  id: string; name: string; rate_percent: number; applies_to: Applies;
  product_id: string | null; category: string | null; member_id: string | null;
  priority: number; is_active: boolean;
};

type Statement = {
  id: string;
  member_id: string;
  member_name?: string | null;
  base_total: number;
  commission_total: number;
  status: "pendente" | "paga";
  generated_at: string;
  paid_at: string | null;
  was_skipped?: boolean;
};

type MemberOpt  = { id: string; label: string };
type ProductOpt = { id: string; name: string; category: string | null };

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function rangeFor(p: Preset) {
  const now = new Date();
  if (p === "this_month") {
    return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (p === "last_month") {
    const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: isoDate(ref), to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
  }
  return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
}

const PRESETS: { v: Preset; l: string }[] = [
  { v: "this_month", l: "Este mês" },
  { v: "last_month", l: "Mês passado" },
  { v: "this_year",  l: "Este ano" },
];

export default function Commissions() {
  const { activeOrg, role, isAdmin } = useOrganization();
  const { user } = useAuth();
  const canManageRules = isAdmin || role === "sales_director";
  const canCloseStatements = isAdmin || role === "sales_director";
  const canWrite = role !== null && role !== "read_only";
  const currency = activeOrg?.currency || "EUR";
  const fmtMoney = useMemo(() => (v: number) => {
    try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v ?? 0); }
    catch { return `${(v ?? 0).toFixed(2)} ${currency}`; }
  }, [currency]);
  const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("pt-PT"); } catch { return d; } };

  const [preset, setPreset] = useState<Preset>("this_month");
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState<Record<string, Detail[]>>({});
  const [detailAdjustments, setDetailAdjustments] = useState<Record<string, Adjustment[]>>({});

  // ===== Por produto =====
  const [byProductPreset, setByProductPreset] = useState<Preset>("this_month");
  const [byProduct, setByProduct] = useState<ByProduct[]>([]);
  const [loadingByProduct, setLoadingByProduct] = useState(false);

  const loadByProduct = useCallback(async () => {
    if (!activeOrg) return;
    setLoadingByProduct(true);
    const { from, to } = rangeFor(byProductPreset);
    const { data, error } = await supabase.rpc("get_commission_by_product" as any, {
      _org_id: activeOrg.id, _from: from, _to: to,
    });
    setLoadingByProduct(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setByProduct((data ?? []) as ByProduct[]);
  }, [activeOrg, byProductPreset]);

  useEffect(() => { loadByProduct(); }, [loadByProduct]);

  const loadSummary = useCallback(async () => {
    if (!activeOrg) return;
    setLoadingSummary(true); setExpanded({}); setDetails({});
    const { from, to } = rangeFor(preset);
    const { data, error } = await supabase.rpc("get_commissions_summary" as any, {
      _org_id: activeOrg.id, _from: from, _to: to,
    });
    setLoadingSummary(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setSummary((data ?? []) as Summary[]);
  }, [activeOrg, preset]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const toggleDetail = async (row: Summary) => {
    const key = row.member_id ?? "__none__";
    if (expanded[key]) { setExpanded((s) => ({ ...s, [key]: false })); return; }
    setExpanded((s) => ({ ...s, [key]: true }));
    if (!details[key]) {
      const { from, to } = rangeFor(preset);
      const { data, error } = await supabase.rpc("get_commission_detail" as any, {
        _org_id: activeOrg!.id, _member_id: row.member_id, _from: from, _to: to,
      });
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      setDetails((s) => ({ ...s, [key]: (data ?? []) as Detail[] }));
      // Reconciliação: buscar ajustes manuais do comercial neste período
      if (row.member_id) {
        const { data: adjData } = await supabase
          .from("commission_adjustments" as any)
          .select("id, member_id, period_start, period_end, label, amount, notes")
          .eq("organization_id", activeOrg!.id)
          .eq("member_id", row.member_id)
          .eq("period_start", from)
          .eq("period_end", to)
          .order("created_at", { ascending: true });
        setDetailAdjustments((s) => ({ ...s, [key]: ((adjData ?? []) as unknown as Adjustment[]) }));
      } else {
        setDetailAdjustments((s) => ({ ...s, [key]: [] }));
      }
    }
  };

  // ===== Rules =====
  const [rules, setRules] = useState<Rule[]>([]);
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [ruleDialog, setRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

  const loadRules = useCallback(async () => {
    if (!activeOrg) return;
    const { data, error } = await supabase.from("commission_rules" as any)
      .select("id, name, rate_percent, applies_to, product_id, category, member_id, priority, is_active")
      .eq("organization_id", activeOrg.id)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setRules((data ?? []) as unknown as Rule[]);
  }, [activeOrg]);

  const loadOptions = useCallback(async () => {
    if (!activeOrg) return;
    const [mRes, pRes] = await Promise.all([
      supabase.from("organization_members").select("id, user_id")
        .eq("organization_id", activeOrg.id).eq("status", "active"),
      supabase.from("products").select("id, name, category")
        .eq("organization_id", activeOrg.id).eq("is_active", true).order("name"),
    ]);
    if (!mRes.error && mRes.data) {
      const userIds = (mRes.data as any[]).map((m) => m.user_id);
      const { data: profs } = await supabase.from("profiles")
        .select("id, full_name, email").in("id", userIds);
      const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
      setMembers((mRes.data as any[]).map((m) => {
        const p = byId.get(m.user_id) as any;
        return { id: m.id, label: p?.full_name || p?.email || "Membro" };
      }));
    }
    if (!pRes.error && pRes.data) {
      setProducts(pRes.data as any);
      const cats = Array.from(new Set((pRes.data as any[]).map((p) => p.category).filter(Boolean))) as string[];
      setCategories(cats);
    }
  }, [activeOrg]);

  useEffect(() => { loadRules(); if (canManageRules) loadOptions(); }, [loadRules, loadOptions, canManageRules]);

  const openNewRule = () => {
    setEditingRule({
      id: "", name: "", rate_percent: 5, applies_to: "all",
      product_id: null, category: null, member_id: null, priority: 0, is_active: true,
    });
    setRuleDialog(true);
  };
  const openEditRule = (r: Rule) => { setEditingRule({ ...r }); setRuleDialog(true); };

  const saveRule = async () => {
    if (!editingRule || !activeOrg) return;
    const r = editingRule;
    if (!r.name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (r.rate_percent < 0 || r.rate_percent > 100) { toast({ title: "Percentagem inválida", variant: "destructive" }); return; }
    if (r.applies_to === "product" && !r.product_id) { toast({ title: "Escolha um produto", variant: "destructive" }); return; }
    if (r.applies_to === "category" && !r.category) { toast({ title: "Escolha uma categoria", variant: "destructive" }); return; }
    if (r.applies_to === "member" && !r.member_id) { toast({ title: "Escolha um comercial", variant: "destructive" }); return; }

    const payload: any = {
      organization_id: activeOrg.id,
      name: r.name.trim(),
      rate_percent: r.rate_percent,
      applies_to: r.applies_to,
      product_id:  r.applies_to === "product"  ? r.product_id  : null,
      category:    r.applies_to === "category" ? r.category    : null,
      member_id:   r.applies_to === "member"   ? r.member_id   : null,
      priority: r.priority,
      is_active: r.is_active,
    };

    let error;
    if (r.id) {
      ({ error } = await supabase.from("commission_rules" as any).update(payload).eq("id", r.id));
    } else {
      payload.created_by = user?.id;
      ({ error } = await supabase.from("commission_rules" as any).insert(payload));
    }
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setRuleDialog(false); setEditingRule(null); loadRules(); loadSummary();
  };

  const toggleActive = async (r: Rule) => {
    const { error } = await supabase.from("commission_rules" as any).update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    loadRules(); loadSummary();
  };
  const deleteRule = async (r: Rule) => {
    if (!confirm(`Apagar a regra "${r.name}"?`)) return;
    const { error } = await supabase.from("commission_rules" as any).delete().eq("id", r.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    loadRules(); loadSummary();
  };

  const appliesLabel = (a: Applies) => ({ all: "Todas", product: "Produto", category: "Categoria", member: "Comercial" }[a]);

  // ===== Statements (Extratos) =====
  const [stmtPreset, setStmtPreset] = useState<Preset>("this_month");
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loadingStmts, setLoadingStmts] = useState(false);
  const [closing, setClosing] = useState(false);
  const [skippedNote, setSkippedNote] = useState<number>(0);

  const loadStatements = useCallback(async () => {
    if (!activeOrg) return;
    setLoadingStmts(true);
    const { from, to } = rangeFor(stmtPreset);
    const { data, error } = await supabase
      .from("commission_statements" as any)
      .select("id, member_id, base_total, commission_total, status, generated_at, paid_at")
      .eq("organization_id", activeOrg.id)
      .eq("period_start", from)
      .eq("period_end", to)
      .order("commission_total", { ascending: false });
    setLoadingStmts(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    const raw = (data ?? []) as any[];
    // Resolve member names via organization_members + profiles
    const memberIds = Array.from(new Set(raw.map((r) => r.member_id)));
    const nameById = new Map<string, string>();
    if (memberIds.length > 0) {
      const { data: oms } = await supabase
        .from("organization_members")
        .select("id, user_id")
        .in("id", memberIds);
      const userIds = (oms ?? []).map((m: any) => m.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      const profById = new Map((profs ?? []).map((p: any) => [p.id, p]));
      (oms ?? []).forEach((m: any) => {
        const p = profById.get(m.user_id) as any;
        nameById.set(m.id, p?.full_name || p?.email || "Comercial");
      });
    }
    const rows: Statement[] = raw.map((r) => ({
      id: r.id,
      member_id: r.member_id,
      member_name: nameById.get(r.member_id) || "Comercial",
      base_total: Number(r.base_total),
      commission_total: Number(r.commission_total),
      status: r.status,
      generated_at: r.generated_at,
      paid_at: r.paid_at,
    }));
    setStatements(rows);
    setSkippedNote(0);
  }, [activeOrg, stmtPreset]);

  useEffect(() => { loadStatements(); }, [loadStatements]);

  const closePeriod = async () => {
    if (!activeOrg) return;
    setClosing(true);
    const { from, to } = rangeFor(stmtPreset);
    const { data, error } = await supabase.rpc("generate_commission_statements" as any, {
      _org_id: activeOrg.id, _from: from, _to: to,
    });
    setClosing(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    const skipped = ((data ?? []) as any[]).filter((r) => r.was_skipped).length;
    setSkippedNote(skipped);
    toast({
      title: "Período fechado",
      description: skipped > 0
        ? `Extratos atualizados. ${skipped} extrato(s) já pago(s) foram mantidos.`
        : "Extratos gerados/atualizados com sucesso.",
    });
    loadStatements();
  };

  const markPaid = async (s: Statement) => {
    if (!confirm(`Marcar o extrato de ${s.member_name} como pago?`)) return;
    const { error } = await supabase.rpc("mark_commission_statement_paid" as any, { _statement_id: s.id });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Marcado como pago" });
    loadStatements();
  };

  // ===== Ajustes manuais =====
  const [adjPreset, setAdjPreset] = useState<Preset>("this_month");
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loadingAdj, setLoadingAdj] = useState(false);
  const [adjDialog, setAdjDialog] = useState(false);
  const [editingAdj, setEditingAdj] = useState<{
    id: string; member_id: string; label: string; amount: number; notes: string;
  } | null>(null);

  const loadAdjustments = useCallback(async () => {
    if (!activeOrg || !canManageRules) return;
    setLoadingAdj(true);
    const { from, to } = rangeFor(adjPreset);
    const { data, error } = await supabase
      .from("commission_adjustments" as any)
      .select("id, member_id, period_start, period_end, label, amount, notes")
      .eq("organization_id", activeOrg.id)
      .eq("period_start", from)
      .eq("period_end", to)
      .order("created_at", { ascending: false });
    setLoadingAdj(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setAdjustments(((data ?? []) as unknown as Adjustment[]));
  }, [activeOrg, adjPreset, canManageRules]);

  useEffect(() => { loadAdjustments(); }, [loadAdjustments]);

  const memberLabel = (mid: string) =>
    members.find((m) => m.id === mid)?.label ?? "Comercial";

  const openNewAdj = () => {
    setEditingAdj({ id: "", member_id: "", label: "", amount: 0, notes: "" });
    setAdjDialog(true);
  };
  const openEditAdj = (a: Adjustment) => {
    setEditingAdj({
      id: a.id, member_id: a.member_id, label: a.label,
      amount: Number(a.amount), notes: a.notes ?? "",
    });
    setAdjDialog(true);
  };

  const saveAdj = async () => {
    if (!editingAdj || !activeOrg) return;
    const a = editingAdj;
    if (!a.member_id) { toast({ title: "Escolha um comercial", variant: "destructive" }); return; }
    if (!a.label.trim()) { toast({ title: "Descrição obrigatória", variant: "destructive" }); return; }
    if (!Number.isFinite(a.amount) || a.amount === 0) {
      toast({ title: "Valor inválido", description: "Use um valor diferente de zero (negativo permitido).", variant: "destructive" });
      return;
    }
    const { from, to } = rangeFor(adjPreset);
    const payload: any = {
      organization_id: activeOrg.id,
      member_id: a.member_id,
      period_start: from,
      period_end: to,
      label: a.label.trim(),
      amount: a.amount,
      notes: a.notes.trim() || null,
    };
    let error;
    if (a.id) {
      ({ error } = await supabase.from("commission_adjustments" as any).update(payload).eq("id", a.id));
    } else {
      payload.created_by = user?.id;
      ({ error } = await supabase.from("commission_adjustments" as any).insert(payload));
    }
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setAdjDialog(false); setEditingAdj(null);
    loadAdjustments(); loadSummary();
  };

  const deleteAdj = async (a: Adjustment) => {
    if (!confirm(`Apagar o ajuste "${a.label}"?`)) return;
    const { error } = await supabase.from("commission_adjustments" as any).delete().eq("id", a.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    loadAdjustments(); loadSummary();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Comissões</h1>
        <p className="text-sm text-muted-foreground">
          Base de cálculo: valor das linhas sem IVA, em encomendas pagas ou faturadas. O total de comissão inclui ajustes manuais quando existam (bónus, correções, clawbacks).
        </p>
      </div>

      <Tabs defaultValue="resumo">
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="por-produto">Por produto</TabsTrigger>
          <TabsTrigger value="extratos">Extratos</TabsTrigger>
          {canManageRules && <TabsTrigger value="ajustes">Ajustes</TabsTrigger>}
          {canManageRules && <TabsTrigger value="regras">Regras de comissão</TabsTrigger>}
        </TabsList>

        <TabsContent value="resumo" className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Comercial</TableHead>
                    <TableHead className="text-right">Encomendas</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingSummary && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">A carregar…</TableCell></TableRow>}
                  {!loadingSummary && summary.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sem comissões no período.</TableCell></TableRow>}
                  {!loadingSummary && summary.map((r) => {
                    const key = r.member_id ?? "__none__";
                    const open = !!expanded[key];
                    const det = details[key];
                    return (
                      <Fragment key={key}>
                        <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => toggleDetail(r)}>
                          <TableCell>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                          <TableCell className="font-medium">{r.member_name}</TableCell>
                          <TableCell className="text-right">{r.num_orders}</TableCell>
                          <TableCell className="text-right">{fmtMoney(Number(r.base_total))}</TableCell>
                          <TableCell className="text-right font-semibold">{fmtMoney(Number(r.commission_total))}</TableCell>
                        </TableRow>
                        {open && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/30 p-0">
                              {!det ? (
                                <div className="py-4 text-center text-sm text-muted-foreground">A carregar detalhe…</div>
                              ) : det.length === 0 ? (
                                <div className="py-4 text-center text-sm text-muted-foreground">Sem linhas.</div>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Encomenda</TableHead>
                                      <TableHead>Data</TableHead>
                                      <TableHead>Produto / Descrição</TableHead>
                                      <TableHead className="text-right">Base</TableHead>
                                      <TableHead className="text-right">Taxa</TableHead>
                                      <TableHead className="text-right">Comissão</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {det.map((d) => (
                                      <TableRow key={d.line_id}>
                                        <TableCell>{d.order_number}</TableCell>
                                        <TableCell>{fmtDate(d.order_date)}</TableCell>
                                        <TableCell>{d.product_name}</TableCell>
                                        <TableCell className="text-right">{fmtMoney(Number(d.base))}</TableCell>
                                        <TableCell className="text-right">{Number(d.rate_percent).toFixed(2)}%</TableCell>
                                        <TableCell className="text-right">{fmtMoney(Number(d.commission))}</TableCell>
                                      </TableRow>
                                    ))}
                                    {(detailAdjustments[key] ?? []).map((a) => (
                                      <TableRow key={`adj-${a.id}`} className="bg-amber-50/40 dark:bg-amber-950/20">
                                        <TableCell>—</TableCell>
                                        <TableCell>{fmtDate(a.period_end)}</TableCell>
                                        <TableCell>
                                          <div className="flex items-center gap-2">
                                            <Badge variant="outline">Ajuste manual</Badge>
                                            <span>{a.label}</span>
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                                        <TableCell className={`text-right ${Number(a.amount) < 0 ? "text-destructive" : ""}`}>
                                          {fmtMoney(Number(a.amount))}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="por-produto" className="space-y-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle>Comissão por produto</CardTitle>
              <p className="text-xs text-muted-foreground">
                Base e comissão agregadas por produto no período. A taxa aplicada por linha segue as regras de comissão (Produto &gt; Categoria &gt; Comercial &gt; Todas). Não inclui ajustes manuais.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Select value={byProductPreset} onValueChange={(v) => setByProductPreset(v as Preset)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Nº linhas</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingByProduct && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">A carregar…</TableCell></TableRow>
                  )}
                  {!loadingByProduct && byProduct.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sem comissões por produto no período.</TableCell></TableRow>
                  )}
                  {!loadingByProduct && byProduct.map((p, i) => (
                    <TableRow key={p.product_id ?? `none-${i}`}>
                      <TableCell className="font-medium">{p.product_name}</TableCell>
                      <TableCell>
                        {p.category ? <Badge variant="secondary">{p.category}</Badge> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">{p.num_lines}</TableCell>
                      <TableCell className="text-right">{fmtMoney(Number(p.base_total))}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtMoney(Number(p.commission_total))}</TableCell>
                    </TableRow>
                  ))}
                  {!loadingByProduct && byProduct.length > 0 && (
                    <TableRow className="border-t-2 bg-muted/30">
                      <TableCell className="font-semibold" colSpan={2}>Total</TableCell>
                      <TableCell className="text-right font-semibold">
                        {byProduct.reduce((s, p) => s + Number(p.num_lines), 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {fmtMoney(byProduct.reduce((s, p) => s + Number(p.base_total), 0))}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {fmtMoney(byProduct.reduce((s, p) => s + Number(p.commission_total), 0))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extratos" className="space-y-4">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle>Extratos de comissão</CardTitle>
              <p className="text-xs text-muted-foreground">
                {canCloseStatements
                  ? "Feche o período para gerar/atualizar os extratos. Extratos já pagos não são alterados."
                  : "Vê aqui os seus extratos. Apenas administradores podem fechar períodos."}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={stmtPreset} onValueChange={(v) => setStmtPreset(v as Preset)}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                  </SelectContent>
                </Select>
                {canCloseStatements && (
                  <Button size="sm" onClick={closePeriod} disabled={closing}>
                    {closing ? "A fechar…" : "Fechar período"}
                  </Button>
                )}
                {skippedNote > 0 && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Lock className="h-3 w-3" /> {skippedNote} extrato(s) já pago(s) foram mantidos.
                  </span>
                )}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Comercial</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Gerado em</TableHead>
                    <TableHead>Pago em</TableHead>
                    {canCloseStatements && <TableHead></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingStmts && (
                    <TableRow><TableCell colSpan={canCloseStatements ? 7 : 6} className="text-center py-8 text-muted-foreground">A carregar…</TableCell></TableRow>
                  )}
                  {!loadingStmts && statements.length === 0 && (
                    <TableRow><TableCell colSpan={canCloseStatements ? 7 : 6} className="text-center py-8 text-muted-foreground">
                      Sem extratos para o período selecionado.{canCloseStatements ? " Clique em \"Fechar período\" para gerar." : ""}
                    </TableCell></TableRow>
                  )}
                  {!loadingStmts && statements.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.member_name}</TableCell>
                      <TableCell className="text-right">{fmtMoney(s.base_total)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtMoney(s.commission_total)}</TableCell>
                      <TableCell>
                        {s.status === "paga"
                          ? <Badge className="bg-green-600 hover:bg-green-600">Paga</Badge>
                          : <Badge variant="secondary">Pendente</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(s.generated_at)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.paid_at ? fmtDate(s.paid_at) : "—"}</TableCell>
                      {canCloseStatements && (
                        <TableCell className="text-right">
                          {s.status === "pendente" ? (
                            <Button size="sm" variant="outline" onClick={() => markPaid(s)}>
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Marcar como paga
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                              <Lock className="h-3 w-3" /> Fechado
                            </span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canManageRules && (
          <TabsContent value="ajustes" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Ajustes manuais</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bónus, correções ou clawbacks aplicados ao total de comissão de um comercial no período. Valores negativos descontam. Entram no Resumo (ao vivo) e nos Extratos (ao fechar período).
                  </p>
                </div>
                <Button size="sm" onClick={openNewAdj}><Plus className="h-4 w-4 mr-1" /> Novo ajuste</Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Select value={adjPreset} onValueChange={(v) => setAdjPreset(v as Preset)}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRESETS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Comercial</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Notas</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingAdj && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">A carregar…</TableCell></TableRow>}
                    {!loadingAdj && adjustments.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sem ajustes no período.</TableCell></TableRow>
                    )}
                    {!loadingAdj && adjustments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{memberLabel(a.member_id)}</TableCell>
                        <TableCell>{a.label}</TableCell>
                        <TableCell className={`text-right font-semibold ${Number(a.amount) < 0 ? "text-destructive" : ""}`}>
                          {fmtMoney(Number(a.amount))}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[24rem] truncate">{a.notes ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openEditAdj(a)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteAdj(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canManageRules && (
          <TabsContent value="regras" className="space-y-4">
            {/* see Ajustes tab inserted above */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Regras de comissão</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ordem de especificidade ao escolher a regra de cada linha:{" "}
                    <strong>Produto &gt; Categoria &gt; Comercial &gt; Todas</strong>.
                    Em empate, vence a maior prioridade e, depois, a mais recente.
                  </p>
                </div>
                {canWrite && <Button size="sm" onClick={openNewRule}><Plus className="h-4 w-4 mr-1" /> Nova regra</Button>}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Âmbito</TableHead>
                      <TableHead>Alvo</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Prioridade</TableHead>
                      <TableHead>Ativa</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sem regras. Crie a primeira.</TableCell></TableRow>}
                    {rules.map((r) => {
                      const target = r.applies_to === "product"  ? (products.find((p) => p.id === r.product_id)?.name ?? "—")
                                   : r.applies_to === "category" ? (r.category ?? "—")
                                   : r.applies_to === "member"   ? (members.find((m) => m.id === r.member_id)?.label ?? "—")
                                   : "—";
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell><Badge variant="secondary">{appliesLabel(r.applies_to)}</Badge></TableCell>
                          <TableCell>{target}</TableCell>
                          <TableCell className="text-right">{Number(r.rate_percent).toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{r.priority}</TableCell>
                          <TableCell><Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} /></TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => openEditRule(r)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteRule(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Rule dialog */}
      <Dialog open={ruleDialog} onOpenChange={(o) => { setRuleDialog(o); if (!o) setEditingRule(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingRule?.id ? "Editar regra" : "Nova regra"}</DialogTitle></DialogHeader>
          {editingRule && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={editingRule.name} onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Percentagem</Label>
                  <Input type="number" step="0.01" min={0} max={100}
                    value={editingRule.rate_percent}
                    onChange={(e) => setEditingRule({ ...editingRule, rate_percent: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label>Prioridade</Label>
                  <Input type="number" step="1"
                    value={editingRule.priority}
                    onChange={(e) => setEditingRule({ ...editingRule, priority: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Aplica-se a</Label>
                <Select value={editingRule.applies_to}
                  onValueChange={(v) => setEditingRule({ ...editingRule, applies_to: v as Applies, product_id: null, category: null, member_id: null })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as encomendas</SelectItem>
                    <SelectItem value="product">Produto específico</SelectItem>
                    <SelectItem value="category">Categoria de produto</SelectItem>
                    <SelectItem value="member">Comercial específico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editingRule.applies_to === "product" && (
                <div className="space-y-1">
                  <Label>Produto</Label>
                  <Select value={editingRule.product_id ?? ""}
                    onValueChange={(v) => setEditingRule({ ...editingRule, product_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Escolher produto…" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editingRule.applies_to === "category" && (
                <div className="space-y-1">
                  <Label>Categoria</Label>
                  {categories.length > 0 ? (
                    <Select value={editingRule.category ?? ""}
                      onValueChange={(v) => setEditingRule({ ...editingRule, category: v })}>
                      <SelectTrigger><SelectValue placeholder="Escolher categoria…" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={editingRule.category ?? ""}
                      onChange={(e) => setEditingRule({ ...editingRule, category: e.target.value })} />
                  )}
                </div>
              )}
              {editingRule.applies_to === "member" && (
                <div className="space-y-1">
                  <Label>Comercial</Label>
                  <Select value={editingRule.member_id ?? ""}
                    onValueChange={(v) => setEditingRule({ ...editingRule, member_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Escolher comercial…" /></SelectTrigger>
                    <SelectContent>
                      {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <Label>Ativa</Label>
                <Switch checked={editingRule.is_active}
                  onCheckedChange={(c) => setEditingRule({ ...editingRule, is_active: c })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialog(false)}>Cancelar</Button>
            <Button onClick={saveRule}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustment dialog */}
      <Dialog open={adjDialog} onOpenChange={(o) => { setAdjDialog(o); if (!o) setEditingAdj(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAdj?.id ? "Editar ajuste" : "Novo ajuste"}</DialogTitle>
          </DialogHeader>
          {editingAdj && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Comercial</Label>
                <Select value={editingAdj.member_id}
                  onValueChange={(v) => setEditingAdj({ ...editingAdj, member_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Escolher comercial…" /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Descrição</Label>
                <Input value={editingAdj.label}
                  placeholder="Ex.: Bónus de campanha, Correção, Clawback…"
                  onChange={(e) => setEditingAdj({ ...editingAdj, label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Valor ({currency})</Label>
                <Input type="number" step="0.01"
                  value={editingAdj.amount}
                  onChange={(e) => setEditingAdj({ ...editingAdj, amount: Number(e.target.value) })} />
                <p className="text-xs text-muted-foreground">Use valores negativos para descontos/clawbacks.</p>
              </div>
              <div className="space-y-1">
                <Label>Notas (opcional)</Label>
                <Textarea rows={3} value={editingAdj.notes}
                  onChange={(e) => setEditingAdj({ ...editingAdj, notes: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground">
                Período: <strong>{PRESETS.find((p) => p.v === adjPreset)?.l}</strong> (definido no separador Ajustes).
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjDialog(false)}>Cancelar</Button>
            <Button onClick={saveAdj}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}