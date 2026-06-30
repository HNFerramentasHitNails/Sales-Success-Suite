import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Repeat, Play, Pause, X, History as HistoryIcon, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Sub = {
  id: string;
  customer_id: string;
  assigned_member_id: string | null;
  product_id: string | null;
  description: string | null;
  unit_price: number | null;
  tax_rate: number | null;
  quantity: number;
  discount_percent: number;
  interval_unit: "week" | "month" | "quarter" | "year";
  interval_count: number;
  start_date: string;
  next_run_date: string;
  end_date: string | null;
  status: "active" | "paused" | "canceled";
  runs_count: number;
  last_run_at: string | null;
  notes: string | null;
};

type Customer = { id: string; name: string; assigned_member_id: string | null };
type Product = { id: string; name: string; unit_price: number; tax_rate: number; is_tax_exempt: boolean };
type Member = { id: string; user_id: string; full_name?: string | null; email?: string | null };
type Run = { id: string; run_date: string; status: string; order_id: string | null; error_message: string | null; created_at: string };

const UNIT_LABEL: Record<Sub["interval_unit"], string> = {
  week: "semana(s)", month: "mês/meses", quarter: "trimestre(s)", year: "ano(s)",
};

function fmtMoney(v: number | null | undefined) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT");
}

export default function Subscriptions() {
  const { activeOrg } = useOrganization();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("active");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Sub | null>(null);

  // form
  const [customerId, setCustomerId] = useState<string>("");
  const [mode, setMode] = useState<"product" | "free">("product");
  const [productId, setProductId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");
  const [taxRate, setTaxRate] = useState("23");
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [intervalCount, setIntervalCount] = useState("1");
  const [intervalUnit, setIntervalUnit] = useState<Sub["interval_unit"]>("month");
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [nextRun, setNextRun] = useState<string>(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>("");
  const [assignedMember, setAssignedMember] = useState<string>("__none__");
  const [notes, setNotes] = useState("");
  const [mandateOk, setMandateOk] = useState(false);
  const [saving, setSaving] = useState(false);

  // history drawer
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySub, setHistorySub] = useState<Sub | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const [subsRes, custRes, prodRes, memRes] = await Promise.all([
      (supabase as any).from("recurring_subscriptions").select("*")
        .eq("organization_id", activeOrg.id).order("next_run_date", { ascending: true }),
      supabase.from("customers").select("id,name,assigned_member_id")
        .eq("organization_id", activeOrg.id).order("name"),
      supabase.from("products").select("id,name,unit_price,tax_rate,is_tax_exempt")
        .eq("organization_id", activeOrg.id).eq("is_active", true).order("name"),
      supabase.from("organization_members").select("id,user_id,role")
        .eq("organization_id", activeOrg.id).eq("status", "active"),
    ]);
    if (subsRes.error) toast({ title: "Erro ao carregar", description: subsRes.error.message, variant: "destructive" });
    setSubs((subsRes.data as Sub[]) ?? []);
    setCustomers((custRes.data as Customer[]) ?? []);
    setProducts((prodRes.data as Product[]) ?? []);
    const memberRows = (memRes.data as any[]) ?? [];
    const ids = memberRows.map((m) => m.user_id).filter(Boolean);
    let profs: any[] = [];
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      profs = data ?? [];
    }
    const pmap: Record<string, any> = Object.fromEntries(profs.map((p: any) => [p.id, p]));
    setMembers(
      memberRows.map((m) => ({
        id: m.id, user_id: m.user_id,
        full_name: pmap[m.user_id]?.full_name, email: pmap[m.user_id]?.email,
      }))
    );
    setLoading(false);
  }, [activeOrg]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => subs.filter((s) => filterStatus === "__all__" ? true : s.status === filterStatus),
    [subs, filterStatus]
  );

  const resetForm = () => {
    setEditing(null);
    setCustomerId(""); setMode("product"); setProductId("");
    setDescription(""); setUnitPrice("0"); setTaxRate("23");
    setQuantity("1"); setDiscount("0");
    setIntervalCount("1"); setIntervalUnit("month");
    const today = new Date().toISOString().slice(0, 10);
    setStartDate(today); setNextRun(today); setEndDate("");
    setAssignedMember("__none__"); setNotes(""); setMandateOk(false);
  };

  const openNew = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (s: Sub) => {
    setEditing(s);
    setCustomerId(s.customer_id);
    setMode(s.product_id ? "product" : "free");
    setProductId(s.product_id ?? "");
    setDescription(s.description ?? "");
    setUnitPrice(String(s.unit_price ?? 0));
    setTaxRate(String(s.tax_rate ?? 23));
    setQuantity(String(s.quantity ?? 1));
    setDiscount(String(s.discount_percent ?? 0));
    setIntervalCount(String(s.interval_count));
    setIntervalUnit(s.interval_unit);
    setStartDate(s.start_date);
    setNextRun(s.next_run_date);
    setEndDate(s.end_date ?? "");
    setAssignedMember(s.assigned_member_id ?? "__none__");
    setNotes(s.notes ?? "");
    setMandateOk(!!(s as { mandate_acknowledged_at?: string }).mandate_acknowledged_at);
    setDialogOpen(true);
  };

  const onPickProduct = (id: string) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) {
      setUnitPrice(String(p.unit_price));
      setTaxRate(String(p.is_tax_exempt ? 0 : p.tax_rate));
      if (!description) setDescription(p.name);
    }
  };

  const save = async () => {
    if (!activeOrg) return;
    if (!customerId) { toast({ title: "Selecione um cliente", variant: "destructive" }); return; }
    if (mode === "product" && !productId) { toast({ title: "Selecione um produto", variant: "destructive" }); return; }
    if (mode === "free" && (!description.trim())) { toast({ title: "Descrição obrigatória", variant: "destructive" }); return; }
    if (!mandateOk) { toast({ title: "Confirme o mandato de cobrança recorrente", description: "É necessário declarar que o cliente autorizou a cobrança recorrente.", variant: "destructive" }); return; }

    setSaving(true);
    const payload: any = {
      organization_id: activeOrg.id,
      customer_id: customerId,
      product_id: mode === "product" ? productId : null,
      description: description.trim() || null,
      unit_price: mode === "free" ? Number(unitPrice) : (unitPrice ? Number(unitPrice) : null),
      tax_rate: mode === "free" ? Number(taxRate) : (taxRate ? Number(taxRate) : null),
      quantity: Number(quantity) || 1,
      discount_percent: Number(discount) || 0,
      interval_unit: intervalUnit,
      interval_count: Math.max(1, Number(intervalCount) || 1),
      start_date: startDate,
      next_run_date: nextRun,
      end_date: endDate || null,
      assigned_member_id: assignedMember === "__none__" ? null : assignedMember,
      notes: notes.trim() || null,
      mandate_acknowledged_at: new Date().toISOString(),
    };

    let err;
    if (editing) {
      const r = await (supabase as any).from("recurring_subscriptions").update(payload).eq("id", editing.id);
      err = r.error;
    } else {
      const r = await (supabase as any).from("recurring_subscriptions").insert(payload);
      err = r.error;
    }
    setSaving(false);
    if (err) { toast({ title: "Erro a guardar", description: err.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Subscrição atualizada" : "Subscrição criada" });
    setDialogOpen(false);
    load();
  };

  const setStatus = async (s: Sub, status: Sub["status"]) => {
    const patch: any = { status };
    if (status === "paused") patch.paused_at = new Date().toISOString();
    if (status === "canceled") patch.canceled_at = new Date().toISOString();
    const { error } = await (supabase as any).from("recurring_subscriptions").update(patch).eq("id", s.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: status === "active" ? "Subscrição reativada" : status === "paused" ? "Subscrição pausada" : "Subscrição cancelada" });
    load();
  };

  const runNow = async (s: Sub) => {
    const { data, error } = await (supabase as any).rpc("run_due_subscription", { _subscription_id: s.id });
    if (error) { toast({ title: "Erro a executar", description: error.message, variant: "destructive" }); return; }
    if (!data) {
      toast({ title: "Nada a executar", description: "A subscrição já foi processada para esta data ou não está ativa." });
    } else {
      toast({ title: "Encomenda criada em rascunho" });
    }
    load();
  };

  const openHistory = async (s: Sub) => {
    setHistorySub(s); setHistoryOpen(true); setRuns([]);
    const { data, error } = await (supabase as any).from("recurring_subscription_runs")
      .select("id,run_date,status,order_id,error_message,created_at")
      .eq("subscription_id", s.id).order("run_date", { ascending: false }).limit(50);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setRuns((data as Run[]) ?? []);
  };

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const memberLabel = (id: string | null) => {
    if (!id) return "—";
    const m = members.find((x) => x.id === id);
    return m?.full_name || m?.email || "—";
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Subscrições recorrentes"
        description="Serviços recorrentes que geram encomendas em rascunho automaticamente."
        icon={<Repeat className="h-6 w-6" />}
        actions={<Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova subscrição</Button>}
      />

      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground">Estado</Label>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="paused">Pausadas</SelectItem>
            <SelectItem value="canceled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Repeat />}
          title="Sem subscrições"
          description="Crie a primeira subscrição recorrente para começar."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const overdue = s.status === "active" && new Date(s.next_run_date) < new Date(new Date().toDateString());
            return (
              <Card key={s.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{customerName(s.customer_id)}</span>
                    <Badge variant={s.status === "active" ? "default" : s.status === "paused" ? "secondary" : "outline"}>
                      {s.status === "active" ? "Ativa" : s.status === "paused" ? "Pausada" : "Cancelada"}
                    </Badge>
                    {overdue && <Badge variant="destructive">Em atraso</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">
                    {s.product_id
                      ? (products.find((p) => p.id === s.product_id)?.name || s.description || "Produto")
                      : (s.description || "—")}
                    {" · "}
                    {s.interval_count}× {UNIT_LABEL[s.interval_unit]}
                    {" · "}
                    {fmtMoney(s.unit_price)} (IVA {s.tax_rate ?? 0}%)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Próxima: <strong>{fmtDate(s.next_run_date)}</strong>
                    {" · "}Responsável: {memberLabel(s.assigned_member_id)}
                    {" · "}Execuções: {s.runs_count}
                    {s.end_date ? ` · Fim: ${fmtDate(s.end_date)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {s.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => runNow(s)}>
                      <Play className="h-3.5 w-3.5 mr-1" /> Executar agora
                    </Button>
                  )}
                  {s.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(s, "paused")}>
                      <Pause className="h-3.5 w-3.5 mr-1" /> Pausar
                    </Button>
                  )}
                  {s.status === "paused" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(s, "active")}>
                      <Play className="h-3.5 w-3.5 mr-1" /> Retomar
                    </Button>
                  )}
                  {s.status !== "canceled" && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(s, "canceled")}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openHistory(s)}>
                    <HistoryIcon className="h-3.5 w-3.5 mr-1" /> Histórico
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>Editar</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar subscrição" : "Nova subscrição recorrente"}</DialogTitle>
            <DialogDescription>
              A "próxima data" define quando a primeira encomenda será gerada. Para datas passadas o sistema cria
              <strong> apenas uma</strong> encomenda (a do dia atual) e avança — não encadeia execuções em atraso.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === "product" ? "default" : "outline"}
                onClick={() => setMode("product")}>Produto do catálogo</Button>
              <Button type="button" size="sm" variant={mode === "free" ? "default" : "outline"}
                onClick={() => setMode("free")}>Descrição livre</Button>
            </div>

            {mode === "product" ? (
              <div>
                <Label>Produto</Label>
                <Select value={productId} onValueChange={onPickProduct}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Descrição</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Serviço mensal de manutenção" />
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label>Quantidade</Label><Input type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
              <div><Label>Preço unit.</Label><Input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} /></div>
              <div><Label>IVA %</Label><Input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></div>
              <div><Label>Desconto %</Label><Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>A cada</Label>
                <Input type="number" min={1} value={intervalCount} onChange={(e) => setIntervalCount(e.target.value)} />
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={intervalUnit} onValueChange={(v) => setIntervalUnit(v as Sub["interval_unit"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">semana(s)</SelectItem>
                    <SelectItem value="month">mês/meses</SelectItem>
                    <SelectItem value="quarter">trimestre(s)</SelectItem>
                    <SelectItem value="year">ano(s)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div><Label>Início</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              <div><Label>Próxima execução</Label><Input type="date" value={nextRun} onChange={(e) => setNextRun(e.target.value)} /></div>
              <div><Label>Fim (opcional)</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            </div>

            <div>
              <Label>Responsável</Label>
              <Select value={assignedMember} onValueChange={setAssignedMember}>
                <SelectTrigger><SelectValue placeholder="Por omissão: o do cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Por omissão (responsável do cliente)</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || m.email || m.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <div className="rounded-md border p-3 bg-muted/30 space-y-2">
              <p className="text-xs text-muted-foreground">
                Renovação automática: a cada <strong>{Math.max(1, Number(intervalCount) || 1)} {UNIT_LABEL[intervalUnit]}</strong>,
                a partir de <strong>{nextRun}</strong>{endDate ? <> até <strong>{endDate}</strong></> : ""}. O cliente
                pode cancelar a qualquer momento (pausando ou cancelando a subscrição).
              </p>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={mandateOk} onCheckedChange={(v) => setMandateOk(v === true)} className="mt-0.5" />
                <span>Confirmo que o cliente autorizou a <strong>cobrança recorrente</strong> nas condições acima (mandato).</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{editing ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Histórico de execuções</SheetTitle>
            <SheetDescription>
              {historySub ? customerName(historySub.customer_id) : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {runs.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem execuções ainda.</div>
            ) : runs.map((r) => (
              <Card key={r.id} className="p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{fmtDate(r.run_date)}</div>
                  <Badge variant={r.status === "created" ? "default" : r.status === "error" ? "destructive" : "secondary"}>
                    {r.status === "created" ? "Criada" : r.status === "error" ? "Erro" : "Ignorada"}
                  </Badge>
                </div>
                {r.order_id && (
                  <Link to="/app/orders" className="inline-flex items-center gap-1 text-xs text-primary mt-1">
                    Ver encomenda <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
                {r.error_message && (
                  <div className="text-xs text-destructive mt-1">{r.error_message}</div>
                )}
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}