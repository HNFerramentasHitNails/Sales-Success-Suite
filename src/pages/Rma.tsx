import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Plus, Pencil, Trash2 } from "lucide-react";
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

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("rma")
      .select("id, reason, notes, status, resolution, customer_id, order_id, assigned_to, created_at, customers(id, name), orders(id, order_number)")
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

      <RmaFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
        editing={editing}
      />
    </div>
  );
}