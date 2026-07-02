import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Phone, Plus, ChevronLeft, ChevronRight, RefreshCw, Download,
  User, AlertTriangle, Target, CheckCircle2, XCircle, CalendarClock, MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import CallFormDialog from "@/components/calls/CallFormDialog";
import {
  churnLabel, churnClass, churnPct, phaseLabel, objectiveLabel,
  priorityLabel, priorityClass, priorityBorderClass, priorityRank,
  fmtEUR, daysSince,
} from "@/lib/rfm";

// ---- Tipos ---------------------------------------------------------------
type CustomerEmbed = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  segment: string | null;
  rfm_score: number | null;
  rfm_recency: number | null;
  rfm_frequency: number | null;
  rfm_monetary: number | null;
  churn_risk: string | null;
  overdue_days: number | null;
  lifecycle_phase: string | null;
  total_spent: number | null;
  orders_count: number | null;
  avg_recurrence_days: number | null;
  last_purchase_at: string | null;
  last_purchase_value: number | null;
  assigned_member_id: string | null;
};

type Call = {
  id: string;
  customer_id: string | null;
  prospect_id: string | null;
  assigned_to: string | null;
  scheduled_for: string | null;
  status: string;
  outcome: string | null;
  notes: string | null;
  duration_minutes: number | null;
  priority: string | null;
  objective: string | null;
  reason: string | null;
  generated: boolean | null;
  obtained_value: number | null;
  customers?: CustomerEmbed | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  completed: "Concluída",
  no_answer: "Não atendeu",
  rescheduled: "Reagendada",
  canceled: "Excluída",
};

// ---- Utilitários de data -------------------------------------------------
function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseYmd(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}
function fmtDayLong(d: Date): string {
  const s = d.toLocaleDateString("pt-PT", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---- Componente principal ------------------------------------------------
export default function Calls() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const { user } = useAuth();
  const canSeeAll = isAdmin || role === "sales_director";

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [calls, setCalls] = useState<Call[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewAll, setViewAll] = useState(false);
  const [openNew, setOpenNew] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");

  // Diálogo "Registar Chamada"
  const [actCall, setActCall] = useState<Call | null>(null);
  const [actMode, setActMode] = useState<"complete" | "no_answer" | "reschedule">("complete");
  const [actOutcome, setActOutcome] = useState("");
  const [actObtained, setActObtained] = useState<string>("");
  const [actNotes, setActNotes] = useState("");
  const [actDate, setActDate] = useState("");
  const [saving, setSaving] = useState(false);

  // -------- Carregamento -------------------------------------------------
  const load = useCallback(async () => {
    if (!activeOrg || !user) return;
    setLoading(true);

    const start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);

    const customerCols =
      "id, name, email, phone, segment, rfm_score, rfm_recency, rfm_frequency, rfm_monetary, " +
      "churn_risk, overdue_days, lifecycle_phase, total_spent, orders_count, " +
      "avg_recurrence_days, last_purchase_at, last_purchase_value, assigned_member_id";

    let q = supabase
      .from("sales_calls")
      .select(
        `id, customer_id, prospect_id, assigned_to, scheduled_for, status, outcome,
         notes, duration_minutes, priority, objective, reason, generated, obtained_value,
         customers(${customerCols})`
      )
      .eq("organization_id", activeOrg.id)
      .order("scheduled_for", { ascending: true });

    // Chamadas do dia OU pendentes em atraso de dias anteriores (quando vemos hoje)
    const isToday = ymd(start) === ymd(new Date());
    if (isToday) {
      q = q.or(
        `and(scheduled_for.gte.${start.toISOString()},scheduled_for.lt.${end.toISOString()}),and(status.eq.pending,scheduled_for.lt.${start.toISOString()})`
      );
    } else {
      q = q.gte("scheduled_for", start.toISOString()).lt("scheduled_for", end.toISOString());
    }

    if (!(viewAll && canSeeAll)) {
      q = q.eq("assigned_to", user.id);
    }

    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
      setCalls([]);
    } else {
      setCalls((data ?? []) as any);
    }
    setLoading(false);
  }, [activeOrg?.id, user?.id, viewAll, canSeeAll, selectedDate]);

  useEffect(() => { load(); }, [load]);

  // Mapa user_id → nome (best-effort, silencioso em caso de erro)
  useEffect(() => {
    if (!activeOrg) return;
    (async () => {
      const { data: oms } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", activeOrg.id)
        .eq("status", "active");
      const ids = (oms ?? []).map((m: any) => m.user_id);
      let profs: any[] = [];
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        profs = data ?? [];
      }
      const pmap: Record<string, any> = Object.fromEntries(profs.map((p: any) => [p.id, p]));
      const map: Record<string, string> = {};
      (oms ?? []).forEach((m: any) => {
        map[m.user_id] = pmap[m.user_id]?.full_name || pmap[m.user_id]?.email || "";
      });
      setMemberNames(map);
    })();
  }, [activeOrg?.id]);

  // -------- Listas auxiliares para filtros -------------------------------
  const segments = useMemo(() => {
    const set = new Set<string>();
    calls.forEach((c) => { if (c.customers?.segment) set.add(c.customers.segment); });
    return Array.from(set).sort();
  }, [calls]);

  const phases = useMemo(() => {
    const set = new Set<string>();
    calls.forEach((c) => { if (c.customers?.lifecycle_phase) set.add(c.customers.lifecycle_phase); });
    return Array.from(set);
  }, [calls]);

  // -------- Lista filtrada/ordenada --------------------------------------
  const filtered = useMemo(() => {
    let list = calls.slice();
    if (statusFilter === "all") {
      // Por defeito, esconder as chamadas excluídas (canceladas) da grelha.
      list = list.filter((c) => c.status !== "canceled");
    } else {
      list = list.filter((c) => c.status === statusFilter);
    }
    if (segmentFilter !== "all") list = list.filter((c) => (c.customers?.segment ?? "") === segmentFilter);
    if (phaseFilter !== "all") list = list.filter((c) => (c.customers?.lifecycle_phase ?? "") === phaseFilter);
    return list.sort((a, b) => {
      const pa = priorityRank(a.priority);
      const pb = priorityRank(b.priority);
      if (pa !== pb) return pa - pb;
      const sa = a.customers?.rfm_score ?? 999;
      const sb = b.customers?.rfm_score ?? 999;
      return sa - sb;
    });
  }, [calls, statusFilter, segmentFilter, phaseFilter]);

  // -------- KPIs (sobre TODA a lista do dia, ignorando filtros) ----------
  const kpis = useMemo(() => {
    const tickets: number[] = [];
    calls.forEach((c) => {
      const cu = c.customers;
      if (!cu) return;
      const oc = Number(cu.orders_count ?? 0);
      const ts = Number(cu.total_spent ?? 0);
      if (oc > 0) tickets.push(ts / oc);
    });
    const avgTicket = tickets.length ? tickets.reduce((a, b) => a + b, 0) / tickets.length : 0;
    const totalForeseen = tickets.reduce((a, b) => a + b, 0);

    const completed = calls.filter((c) => c.status === "completed");
    const obtained = completed.reduce((a, c) => a + Number(c.obtained_value ?? 0), 0);
    const withSale = completed.filter((c) => Number(c.obtained_value ?? 0) > 0);
    const effectiveness = completed.length ? (withSale.length / completed.length) * 100 : 0;

    return {
      avgTicket, totalForeseen, ticketsCount: tickets.length,
      obtained, completedCount: completed.length, totalCalls: calls.length,
      effectiveness, withSaleCount: withSale.length,
    };
  }, [calls]);

  // -------- Contadores por status ----------------------------------------
  const counts = useMemo(() => ({
    pending: calls.filter((c) => c.status === "pending").length,
    completed: calls.filter((c) => c.status === "completed").length,
    canceled: calls.filter((c) => c.status === "canceled").length,
  }), [calls]);

  // -------- Ações --------------------------------------------------------
  function shiftDay(delta: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d);
  }

  async function handleGenerate() {
    if (!activeOrg) return;
    setRefreshing(true);
    const { data, error } = await supabase.rpc("refresh_daily_calls", {
      p_org: activeOrg.id,
      p_date: ymd(selectedDate),
    });
    setRefreshing(false);
    if (error) {
      toast({ title: "Erro a gerar chamadas", description: error.message, variant: "destructive" });
      return;
    }
    const n = Number(data ?? 0);
    toast({ title: n > 0 ? `Geradas ${n} chamadas` : "Sem chamadas novas", description: n > 0 ? "Os clientes em risco foram analisados." : "Nada a gerar para este dia." });
    load();
  }

  function openRegister(c: Call) {
    setActCall(c);
    setActMode("complete");
    setActOutcome(c.outcome ?? "");
    setActObtained(c.obtained_value != null ? String(c.obtained_value) : "");
    setActNotes(c.notes ?? "");
    const base = c.scheduled_for ? new Date(c.scheduled_for) : new Date();
    base.setDate(base.getDate() + 1);
    setActDate(toLocalInput(base.toISOString()));
  }

  async function confirmRegister() {
    if (!actCall) return;
    setSaving(true);
    const upd: any = { notes: actNotes || null };
    if (actMode === "complete") {
      upd.status = "completed";
      upd.outcome = actOutcome || null;
      upd.obtained_value = actObtained === "" ? null : Number(actObtained);
    } else if (actMode === "no_answer") {
      upd.status = "no_answer";
      upd.outcome = actOutcome || null;
    } else if (actMode === "reschedule") {
      if (!actDate) {
        toast({ title: "Indique a nova data/hora", variant: "destructive" });
        setSaving(false); return;
      }
      upd.status = "rescheduled";
      upd.scheduled_for = new Date(actDate).toISOString();
    }
    const { error } = await supabase.from("sales_calls").update(upd).eq("id", actCall.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Chamada atualizada" });
    setActCall(null);
    load();
  }

  async function cancelCall(c: Call) {
    const { error } = await supabase.from("sales_calls").update({ status: "canceled" }).eq("id", c.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Chamada excluída" });
    load();
  }

  // -------- Exportação RFV (CSV) ----------------------------------------
  function exportRFV() {
    const header = [
      "Cliente", "Email", "Telefone", "Segmento", "Fase", "Score",
      "R", "F", "M", "Risco churn", "Dias em atraso", "LTV",
      "Ticket médio", "Objetivo", "Estado",
    ];
    const rows = filtered.map((c) => {
      const cu = c.customers;
      const ticket = cu && Number(cu.orders_count ?? 0) > 0
        ? Number(cu.total_spent ?? 0) / Number(cu.orders_count)
        : 0;
      return [
        cu?.name ?? "", cu?.email ?? "", cu?.phone ?? "",
        cu?.segment ?? "", phaseLabel(cu?.lifecycle_phase),
        cu?.rfm_score ?? "", cu?.rfm_recency ?? "", cu?.rfm_frequency ?? "", cu?.rfm_monetary ?? "",
        churnLabel(cu?.churn_risk), cu?.overdue_days ?? "",
        Number(cu?.total_spent ?? 0).toFixed(2),
        ticket.toFixed(2),
        objectiveLabel(c.objective),
        STATUS_LABEL[c.status] ?? c.status,
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((v) => {
        const s = String(v ?? "");
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rfv_${ymd(selectedDate)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // -------- Render -------------------------------------------------------
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={<Phone className="h-6 w-6" />}
        title="Chamadas do Dia"
        description="Painel diário de retenção: chamadas geradas automaticamente para clientes em risco de churn, ordenadas por prioridade e score RFM."
      />

      {/* KPIs --------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Ticket Médio Previsto</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtEUR(kpis.avgTicket)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Total previsto: <span className="tabular-nums">{fmtEUR(kpis.totalForeseen)}</span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Valor Obtido</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{fmtEUR(kpis.obtained)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {kpis.completedCount}/{kpis.totalCalls} chamadas
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Taxa de Efectividade</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{kpis.effectiveness.toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground mt-1">
            {kpis.withSaleCount}/{kpis.completedCount} chamadas
          </div>
        </Card>
      </div>

      {/* Painéis explicativos --------------------------------------- */}
      <Accordion type="multiple" className="space-y-2">
        <AccordionItem value="rules" className="border rounded-md px-4">
          <AccordionTrigger className="text-sm font-medium">
            Regras de geração de chamadas
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
            Todas as madrugadas (06:00) o sistema gera chamadas para os clientes ATIVOS com risco
            de churn ALTO ou CRÍTICO (dias além da recorrência esperada &gt; 15) que ainda não
            tenham uma chamada pendente. Prioridade: crítico → Urgente, alto → Alta.
            Objetivo: Retenção. As chamadas não realizadas são reagendadas e a prioridade sobe
            (normal → alta → urgente).
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="rfm" className="border rounded-md px-4">
          <AccordionTrigger className="text-sm font-medium">
            Como funciona o Score e Segmentação RFM
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
            Score 0-100 = (R+F+M)/15×100. R (Recência) compara os dias desde a última compra com
            a recorrência média do cliente. F (Frequência) = nº de encomendas. M (Monetário) =
            total gasto. O risco de churn mede os dias para além da recorrência esperada
            (≤0 Baixo · ≤15 Médio · ≤45 Alto · &gt;45 Crítico).
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Navegação por dia ----------------------------------------- */}
      <Card className="p-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => shiftDay(-1)} aria-label="Dia anterior">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="text-base font-medium">{fmtDayLong(selectedDate)}</div>
        <Button variant="ghost" size="icon" onClick={() => shiftDay(1)} aria-label="Dia seguinte">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </Card>

      {/* Contadores + ações ---------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{counts.pending} pendentes</Badge>
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">
            {counts.completed} concluídas
          </Badge>
          <Badge variant="outline">{counts.canceled} excluídos</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleGenerate} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "A gerar..." : "Gerar chamadas do dia"}
          </Button>
          <Button variant="outline" onClick={() => setOpenNew(true)}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Filtros --------------------------------------------------- */}
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Estado</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Segmento</Label>
          <Select value={segmentFilter} onValueChange={setSegmentFilter}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Segmentos</SelectItem>
              {segments.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fase</Label>
          <Select value={phaseFilter} onValueChange={setPhaseFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Fases</SelectItem>
              {phases.map((p) => <SelectItem key={p} value={p}>{phaseLabel(p)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {canSeeAll && (
          <div className="flex items-center gap-2 ml-2 pb-1">
            <Switch id="viewall" checked={viewAll} onCheckedChange={setViewAll} />
            <Label htmlFor="viewall" className="text-sm">Ver todas (equipa)</Label>
          </div>
        )}
        <div className="ml-auto pb-1">
          <Button variant="outline" onClick={exportRFV}>
            <Download className="h-4 w-4 mr-2" /> Exportar RFV
          </Button>
        </div>
      </Card>

      {/* Grelha de cartões ---------------------------------------- */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-72 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Phone />}
          title="Sem chamadas para mostrar"
          description={
            <>
              Use “Gerar chamadas do dia” ou importe histórico de encomendas para os clientes em risco aparecerem aqui.
              {statusFilter === "all" && counts.canceled > 0 && (
                <div className="mt-2 text-xs">
                  {counts.canceled} chamada(s) excluída(s) escondida(s) — selecione “Excluída” no filtro Estado para as ver.
                </div>
              )}
            </>
          }
          action={<Button onClick={handleGenerate}><RefreshCw className="h-4 w-4 mr-2" />Gerar chamadas do dia</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <CallCard
              key={c.id}
              call={c}
              memberName={c.assigned_to ? (memberNames[c.assigned_to] || "") : ""}
              onRegister={() => openRegister(c)}
              onCancel={() => cancelCall(c)}
            />
          ))}
        </div>
      )}

      {/* Diálogo "Adicionar" -------------------------------------- */}
      <CallFormDialog open={openNew} onOpenChange={setOpenNew} onSaved={load} />

      {/* Diálogo "Registar Chamada" ------------------------------- */}
      <Dialog open={!!actCall} onOpenChange={(o) => { if (!o) setActCall(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registar Chamada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                variant={actMode === "complete" ? "default" : "outline"}
                onClick={() => setActMode("complete")}
                className="h-auto py-2"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Atendida
              </Button>
              <Button
                variant={actMode === "no_answer" ? "default" : "outline"}
                onClick={() => setActMode("no_answer")}
                className="h-auto py-2"
              >
                <XCircle className="h-4 w-4 mr-1" /> Não atendeu
              </Button>
              <Button
                variant={actMode === "reschedule" ? "default" : "outline"}
                onClick={() => setActMode("reschedule")}
                className="h-auto py-2"
              >
                <CalendarClock className="h-4 w-4 mr-1" /> Reagendar
              </Button>
            </div>

            {actMode === "complete" && (
              <>
                <div className="space-y-1">
                  <Label>Resultado</Label>
                  <Input value={actOutcome} onChange={(e) => setActOutcome(e.target.value)} placeholder="Resumo do resultado" />
                </div>
                <div className="space-y-1">
                  <Label>Valor de venda obtido (€)</Label>
                  <Input
                    type="number" inputMode="decimal" step="0.01" min="0"
                    value={actObtained}
                    onChange={(e) => setActObtained(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </>
            )}

            {actMode === "no_answer" && (
              <div className="space-y-1">
                <Label>Resultado</Label>
                <Input value={actOutcome} onChange={(e) => setActOutcome(e.target.value)} placeholder="Ex.: voicemail" />
              </div>
            )}

            {actMode === "reschedule" && (
              <div className="space-y-1">
                <Label>Nova data/hora</Label>
                <Input type="datetime-local" value={actDate} onChange={(e) => setActDate(e.target.value)} />
              </div>
            )}

            <div className="space-y-1">
              <Label>Notas</Label>
              <Textarea rows={3} value={actNotes} onChange={(e) => setActNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActCall(null)}>Cancelar</Button>
            <Button onClick={confirmRegister} disabled={saving}>
              {saving ? "A guardar..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Cartão de chamada --------------------------------------------------
function CallCard({
  call, memberName, onRegister, onCancel,
}: {
  call: Call;
  memberName: string;
  onRegister: () => void;
  onCancel: () => void;
}) {
  const c = call.customers;
  const risk = c?.churn_risk ?? null;
  const needsAttention = risk === "alto" || risk === "critico";
  const ds = daysSince(c?.last_purchase_at);
  const ticket = c && Number(c.orders_count ?? 0) > 0
    ? Number(c.total_spent ?? 0) / Number(c.orders_count)
    : 0;

  const riskPanelBg = needsAttention
    ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900"
    : "bg-muted/50 border-border";

  return (
    <Card className={`p-4 space-y-3 ${priorityBorderClass(call.priority)}`}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{c?.name ?? "—"}</div>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <Badge variant="outline" className={priorityClass(call.priority)}>
              {priorityLabel(call.priority)}
            </Badge>
            {call.status !== "pending" && (
              <Badge variant="outline">{STATUS_LABEL[call.status] ?? call.status}</Badge>
            )}
          </div>
        </div>
        <div className="flex items-start gap-1">
          <div className="text-right rounded-md border bg-muted/30 px-2 py-1">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Score</div>
            <div className="text-lg font-semibold tabular-nums leading-none">
              {c?.rfm_score ?? "—"}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onCancel} className="text-destructive">
                Excluir chamada
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {needsAttention && (
          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900">
            <AlertTriangle className="h-3 w-3 mr-1" /> Precisam de Atenção
          </Badge>
        )}
        <Badge variant="outline">
          {c?.segment ? `Seg. ${c.segment} · ` : ""}{phaseLabel(c?.lifecycle_phase)}
        </Badge>
      </div>

      {/* Responsável + email */}
      <div className="text-sm space-y-0.5">
        {memberName && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span>{memberName}</span>
          </div>
        )}
        {c?.email && <div className="text-xs text-muted-foreground truncate">{c.email}</div>}
      </div>

      {/* Painel de churn */}
      <div className={`rounded-md border p-3 space-y-2 ${riskPanelBg}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">
            Risco de Churn: <span className={`px-1.5 py-0.5 rounded text-xs border ${churnClass(risk)}`}>{churnLabel(risk)}</span>
          </span>
        </div>
        {call.reason && (
          <div className="text-xs text-muted-foreground">{call.reason}</div>
        )}
        <Progress value={churnPct(risk)} className="h-1.5" />
      </div>

      {/* Objetivo */}
      <div className="flex items-center gap-1.5 text-sm">
        <Target className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Objetivo: <strong>{objectiveLabel(call.objective)}</strong></span>
      </div>

      {/* Stats 2x2 */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border p-2">
          <div className="text-muted-foreground">Última compra</div>
          <div className="font-medium tabular-nums">{ds != null ? `${ds} dias` : "—"}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-muted-foreground">Recorrência</div>
          <div className="font-medium tabular-nums">
            {c?.avg_recurrence_days ? `${c.avg_recurrence_days}d` : "—"}
          </div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-muted-foreground">LTV</div>
          <div className="font-medium tabular-nums">{fmtEUR(c?.total_spent)}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-muted-foreground">Ticket</div>
          <div className="font-medium tabular-nums">{fmtEUR(ticket)}</div>
        </div>
      </div>

      {/* Porquê (collapsible) */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-start h-7 px-2 text-xs">
            Porque está nesta fase
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="text-xs text-muted-foreground p-2 border rounded-md mt-1">
          {buildPhaseExplanation(c, ds)}
        </CollapsibleContent>
      </Collapsible>

      {/* Telefone */}
      {c?.phone && (
        <a
          href={`tel:${c.phone}`}
          className="block text-sm text-primary hover:underline truncate"
        >
          {c.phone}
        </a>
      )}

      {/* Botão principal */}
      <Button className="w-full" onClick={onRegister}>
        <Phone className="h-4 w-4 mr-2" /> Registar Chamada
      </Button>
    </Card>
  );
}

function buildPhaseExplanation(c: CustomerEmbed | null | undefined, ds: number | null): string {
  if (!c) return "Sem dados RFM suficientes.";
  const parts: string[] = [];
  if (c.lifecycle_phase) parts.push(`Fase atual: ${phaseLabel(c.lifecycle_phase)}.`);
  if (c.avg_recurrence_days && ds != null) {
    parts.push(`Recorrência média ~${c.avg_recurrence_days}d, última compra há ${ds} dias.`);
  } else if (ds != null) {
    parts.push(`Última compra há ${ds} dias.`);
  } else {
    parts.push("Sem registo de compras ainda.");
  }
  if (c.overdue_days != null && c.overdue_days > 0) {
    parts.push(`${c.overdue_days} dias além do esperado.`);
  }
  if (c.rfm_score != null) parts.push(`Score RFM ${c.rfm_score}/100.`);
  return parts.join(" ");
}