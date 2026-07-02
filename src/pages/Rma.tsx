import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Plus, Pencil, Trash2, Receipt, Loader2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import RmaFormDialog, { type RmaRow } from "@/components/postsale/RmaFormDialog";

type Rma = RmaRow & {
  created_at: string;
  customers?: { id: string; name: string } | null;
  orders?: { id: string; order_number: string } | null;
  credit_notes?: Array<{ id: string; credit_note_number: string; total: number; refund_method: string | null; refund_status: string | null }>;
};

const REFUND_STATUS_LABEL: Record<string, string> = {
  done: "carteira creditada",
  pending: "reembolso pendente (método original)",
  none: "sem reembolso",
};

// Columns are "buckets" — the closed bucket aggregates the terminal statuses
const COLUMNS: { v: string; l: string; match: (s: string) => boolean }[] = [
  { v: "pending", l: "Pendentes", match: (s) => s === "pending" },
  { v: "received", l: "Recebidos", match: (s) => s === "received" },
  { v: "inspecting", l: "Em Inspeção", match: (s) => s === "inspecting" },
  { v: "closed", l: "Fechados", match: (s) => ["approved", "rejected", "refunded", "closed"].includes(s) },
];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  received: "Recebido",
  inspecting: "Em inspeção",
  approved: "Aprovado",
  rejected: "Rejeitado",
  refunded: "Reembolsado",
  closed: "Fechado",
};
const STATUS_FLOW = ["pending", "received", "inspecting", "approved", "rejected", "refunded", "closed"];

const RESOLUTION_LABEL: Record<string, string> = {
  refund: "Reembolso",
  replace: "Substituição",
  credit: "Crédito",
  none: "Nenhuma",
};

export default function RmaPage() {
  const { activeOrg, role } = useOrganization();
  const canWrite = role !== "read_only" && role !== null;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Rma[]>([]);
  const [members, setMembers] = useState<Array<{ user_id: string; name: string }>>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RmaRow | null>(null);
  const [regularizing, setRegularizing] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const isAdmin = role === "owner" || role === "admin";

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("rma")
      .select("id, reason, notes, status, resolution, customer_id, order_id, assigned_to, created_at, customers(id, name), orders(id, order_number), credit_notes(id, credit_note_number, total, refund_method, refund_status)")
      .eq("organization_id", activeOrg.id)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setItems((data ?? []) as any);
    setLoading(false);
  }, [activeOrg?.id]);

  useEffect(() => { load(); }, [load]);

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
      setMembers(
        (oms ?? []).map((m: any) => ({
          user_id: m.user_id,
          name: pmap[m.user_id]?.full_name || pmap[m.user_id]?.email || "—",
        })),
      );
    })();
  }, [activeOrg?.id]);

  const memberName = (uid: string | null) => members.find((m) => m.user_id === uid)?.name ?? "—";

  const grouped = useMemo(() => {
    const m = new Map<string, Rma[]>();
    COLUMNS.forEach((c) => m.set(c.v, []));
    items.forEach((i) => {
      const col = COLUMNS.find((c) => c.match(i.status));
      if (col) m.get(col.v)!.push(i);
    });
    return m;
  }, [items]);

  async function setStatus(i: Rma, newStatus: string) {
    const { error } = await supabase.from("rma").update({ status: newStatus }).eq("id", i.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  }

  async function setResolution(i: Rma, newResolution: string) {
    const value = newResolution === "__none__" ? null : newResolution;
    const { error } = await supabase.from("rma").update({ resolution: value }).eq("id", i.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  }

  async function regularize(i: Rma) {
    const label = i.resolution === "credit" ? "creditar a carteira do cliente" : "registar o reembolso ao método original";
    if (!confirm(`Regularizar a devolução de ${i.customers?.name ?? "cliente"}?\n\nVai emitir nota de crédito, repor stock, ${label} e reverter a comissão. Esta ação é registada e não duplica.`)) return;
    setRegularizing(i.id);
    const { error } = await supabase.rpc("process_rma_resolution" as any, { _rma_id: i.id });
    setRegularizing(null);
    if (error) { toast({ title: "Erro a regularizar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Devolução regularizada", description: "Nota de crédito emitida e movimentos lançados." });
    load();
  }

  async function refundStripe(creditNoteId: string) {
    if (!confirm("Reembolsar este valor no Stripe (cartão original do cliente)?")) return;
    setRefunding(creditNoteId);
    const { data, error } = await supabase.functions.invoke("stripe-refund-credit-note", { body: { credit_note_id: creditNoteId } });
    setRefunding(null);
    if (error || data?.error) {
      let detail = data?.message || data?.error || error?.message;
      const ctx = (error as any)?.context;
      if (ctx?.json) {
        try { const body = await ctx.json(); detail = body?.message || body?.error || detail; } catch { /* corpo não é JSON */ }
      }
      toast({ title: "Erro no reembolso", description: detail, variant: "destructive" });
      return;
    }
    toast({ title: "Reembolso processado", description: "O valor foi devolvido ao cliente." });
    load();
  }

  async function remove(i: Rma) {
    if (!confirm("Eliminar esta devolução?")) return;
    const { error } = await supabase.from("rma").delete().eq("id", i.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<RotateCcw className="h-6 w-6" />}
        title="Devoluções (RMA)"
        description="Pedidos de devolução, inspeção e resolução."
        actions={canWrite ? (
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova devolução
          </Button>
        ) : null}
      />

      <div data-tour="rma-board">
      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<RotateCcw />}
          title="Sem devoluções"
          description="Crie a primeira devolução para começar a gerir o pós-venda."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((c) => (
            <div key={c.v} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{c.l}</h3>
                <Badge variant="outline">{grouped.get(c.v)?.length ?? 0}</Badge>
              </div>
              <div className="space-y-2">
                {(grouped.get(c.v) ?? []).map((i) => (
                  <Card key={i.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm space-y-0.5">
                        {i.customers && <div className="font-medium">{i.customers.name}</div>}
                        {i.orders && <div className="text-xs text-muted-foreground">{i.orders.order_number}</div>}
                      </div>
                      <Badge variant="secondary">{STATUS_LABEL[i.status] ?? i.status}</Badge>
                    </div>
                    {i.reason && <p className="text-xs">{i.reason}</p>}
                    {i.notes && <p className="text-xs text-muted-foreground line-clamp-2">{i.notes}</p>}
                    <div className="text-xs text-muted-foreground">Responsável: {memberName(i.assigned_to)}</div>
                    {i.credit_notes && i.credit_notes.length > 0 && (
                      <div className="rounded bg-muted/60 px-2 py-1 text-xs space-y-1">
                        <div className="font-medium">{i.credit_notes[0].credit_note_number} · {Number(i.credit_notes[0].total ?? 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</div>
                        <div className="text-muted-foreground">{REFUND_STATUS_LABEL[i.credit_notes[0].refund_status ?? ""] ?? "—"}</div>
                        {isAdmin && i.credit_notes[0].refund_method === "original" && i.credit_notes[0].refund_status === "pending" && (
                          <Button size="sm" variant="outline" className="w-full h-6 text-xs" disabled={refunding === i.credit_notes[0].id} onClick={() => refundStripe(i.credit_notes![0].id)}>
                            {refunding === i.credit_notes[0].id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CreditCard className="h-3 w-3 mr-1" />}
                            Reembolsar no Stripe
                          </Button>
                        )}
                      </div>
                    )}

                    {canWrite && (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-1">
                          <Select value={i.status} onValueChange={(v) => setStatus(i, v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_FLOW.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={i.resolution ?? "__none__"} onValueChange={(v) => setResolution(i, v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Resolução" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Sem resolução —</SelectItem>
                              {Object.entries(RESOLUTION_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {isAdmin && i.status === "approved" && (i.resolution === "credit" || i.resolution === "refund") && (
                          <Button size="sm" variant="secondary" className="w-full h-7 text-xs" disabled={regularizing === i.id} onClick={() => regularize(i)}>
                            {regularizing === i.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Receipt className="h-3.5 w-3.5 mr-1" />}
                            Regularizar (nota de crédito)
                          </Button>
                        )}
                        <div className="flex justify-end">
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(i); setDialogOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(i)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
                {(grouped.get(c.v) ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground italic px-1">—</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      <RmaFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
        editing={editing}
      />
    </div>
  );
}