import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Plus, Pencil, Trash2 } from "lucide-react";
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
import IssueFormDialog, { type IssueRow } from "@/components/postsale/IssueFormDialog";

type Issue = IssueRow & {
  resolved_at: string | null;
  created_at: string;
  customers?: { id: string; name: string } | null;
  orders?: { id: string; order_number: string } | null;
};

const STATUSES = [
  { v: "open", l: "Abertos" },
  { v: "investigating", l: "Em Investigação" },
  { v: "resolved", l: "Resolvidos" },
  { v: "closed", l: "Fechados" },
] as const;

const PRIORITY_LABEL: Record<string, string> = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" };
const PRIORITY_VARIANT: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
  low: "outline",
  normal: "secondary",
  high: "default",
  urgent: "destructive",
};

export default function Issues() {
  const { activeOrg, role } = useOrganization();
  const canWrite = role !== "read_only" && role !== null;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Issue[]>([]);
  const [members, setMembers] = useState<Array<{ user_id: string; name: string }>>([]);
  const [filterPriority, setFilterPriority] = useState<string>("__all__");
  const [filterAssignee, setFilterAssignee] = useState<string>("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IssueRow | null>(null);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("issues")
      .select("id, title, description, priority, status, customer_id, order_id, assigned_to, resolved_at, created_at, customers(id, name), orders(id, order_number)")
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

  const filtered = useMemo(() => {
    return items.filter((i) =>
      (filterPriority === "__all__" || i.priority === filterPriority) &&
      (filterAssignee === "__all__" || i.assigned_to === filterAssignee),
    );
  }, [items, filterPriority, filterAssignee]);

  const grouped = useMemo(() => {
    const m = new Map<string, Issue[]>();
    STATUSES.forEach((s) => m.set(s.v, []));
    filtered.forEach((i) => m.get(i.status)?.push(i));
    return m;
  }, [filtered]);

  async function setStatus(i: Issue, newStatus: string) {
    const payload: any = { status: newStatus };
    if (newStatus === "resolved" && !i.resolved_at) payload.resolved_at = new Date().toISOString();
    if (newStatus !== "resolved" && newStatus !== "closed") payload.resolved_at = null;
    const { error } = await supabase.from("issues").update(payload).eq("id", i.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  }

  async function remove(i: Issue) {
    if (!confirm(`Eliminar problema "${i.title}"?`)) return;
    const { error } = await supabase.from("issues").delete().eq("id", i.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<AlertCircle className="h-6 w-6" />}
        title="Problemas"
        description="Reclamações e incidências de clientes."
        actions={canWrite ? (
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Novo problema
          </Button>
        ) : null}
      />

      <div className="flex gap-3 flex-wrap" data-tour="issues-filters">
        <div className="min-w-[180px]">
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as prioridades</SelectItem>
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px]">
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os responsáveis</SelectItem>
              {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div data-tour="issues-board">
      {loading ? (
        <Skeleton className="h-64" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<AlertCircle />}
          title="Sem problemas"
          description="Crie o primeiro problema para começar a registar incidências."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STATUSES.map((s) => (
            <div key={s.v} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{s.l}</h3>
                <Badge variant="outline">{grouped.get(s.v)?.length ?? 0}</Badge>
              </div>
              <div className="space-y-2">
                {(grouped.get(s.v) ?? []).map((i) => (
                  <Card key={i.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm leading-tight">{i.title}</div>
                      <Badge variant={PRIORITY_VARIANT[i.priority] ?? "secondary"}>{PRIORITY_LABEL[i.priority]}</Badge>
                    </div>
                    {i.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{i.description}</p>
                    )}
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {i.customers && <div>Cliente: {i.customers.name}</div>}
                      {i.orders && <div>Encomenda: {i.orders.order_number}</div>}
                      <div>Responsável: {memberName(i.assigned_to)}</div>
                      {i.resolved_at && <div>Resolvido em {new Date(i.resolved_at).toLocaleDateString("pt-PT")}</div>}
                    </div>
                    {canWrite && (
                      <div className="flex items-center justify-between gap-1 pt-1">
                        <Select value={i.status} onValueChange={(v) => setStatus(i, v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((st) => <SelectItem key={st.v} value={st.v}>{st.l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="flex">
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
                {(grouped.get(s.v) ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground italic px-1">—</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      <IssueFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
        editing={editing}
      />
    </div>
  );
}