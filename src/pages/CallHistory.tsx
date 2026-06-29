import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";

type Row = {
  id: string;
  scheduled_for: string | null;
  status: string;
  outcome: string | null;
  notes: string | null;
  assigned_to: string | null;
  customer_id: string | null;
  prospect_id: string | null;
  customers?: { name: string } | null;
  prospects?: { name: string } | null;
};

type Member = { user_id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  completed: "Atendida",
  no_answer: "Não atendeu",
  rescheduled: "Reagendada",
  canceled: "Cancelada",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  completed: "default",
  no_answer: "destructive",
  rescheduled: "outline",
  canceled: "outline",
};

function todayMinus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function CallHistory() {
  const { activeOrg } = useOrganization();
  const [rows, setRows] = useState<Row[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState(todayMinus(30));
  const [to, setTo] = useState(todayMinus(0));
  const [statusFilter, setStatusFilter] = useState("all");
  const [memberFilter, setMemberFilter] = useState("all");
  const [search, setSearch] = useState("");

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
        }))
      );
    })();
  }, [activeOrg?.id]);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    let q = supabase
      .from("sales_calls")
      .select("id, scheduled_for, status, outcome, notes, assigned_to, customer_id, prospect_id, customers(name), prospects(name)")
      .eq("organization_id", activeOrg.id)
      .gte("scheduled_for", new Date(from).toISOString())
      .lte("scheduled_for", new Date(to + "T23:59:59").toISOString())
      .order("scheduled_for", { ascending: false })
      .limit(500);

    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (memberFilter !== "all") q = q.eq("assigned_to", memberFilter);

    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setRows([]);
    } else {
      let list = (data ?? []) as any[];
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        list = list.filter(
          (r) =>
            r.customers?.name?.toLowerCase().includes(s) ||
            r.prospects?.name?.toLowerCase().includes(s)
        );
      }
      setRows(list);
    }
    setLoading(false);
  }, [activeOrg?.id, from, to, statusFilter, memberFilter, search]);

  useEffect(() => { load(); }, [load]);

  function memberName(id: string | null) {
    if (!id) return "—";
    return members.find((m) => m.user_id === id)?.name ?? "—";
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={<History className="h-6 w-6" />}
        title="Histórico de Chamadas"
        description="Consulta o histórico de chamadas da organização."
      />

      <Card className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="space-y-1">
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Estado</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Responsável</Label>
          <Select value={memberFilter} onValueChange={setMemberFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Cliente/Prospect</Label>
          <Input placeholder="Nome..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<History />} title="Sem chamadas no período" description="Ajuste os filtros para ver mais resultados." />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Cliente / Prospect</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    {r.scheduled_for
                      ? new Date(r.scheduled_for).toLocaleString("pt-PT", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {r.customers?.name ?? r.prospects?.name ?? "—"}
                    {r.prospects && !r.customers && (
                      <Badge variant="outline" className="ml-2">Prospect</Badge>
                    )}
                  </TableCell>
                  <TableCell>{memberName(r.assigned_to)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{r.outcome ?? "—"}</TableCell>
                  <TableCell className="max-w-sm truncate">{r.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}