import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Plus, CheckCircle2, XCircle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import ActivityFormDialog from "@/components/calendar/ActivityFormDialog";
import { cn } from "@/lib/utils";

type Activity = {
  id: string;
  title: string;
  type: string;
  status: string;
  customer_id: string | null;
  prospect_id: string | null;
  assigned_to: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  created_by: string | null;
  customers?: { id: string; name: string } | null;
  prospects?: { id: string; name: string } | null;
  assignee?: { full_name: string | null; email: string | null } | null;
};

const TYPE_LABEL: Record<string, string> = {
  meeting: "Reunião",
  call: "Chamada",
  task: "Tarefa",
  followup: "Follow-up",
  other: "Outro",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendada",
  done: "Concluída",
  canceled: "Cancelada",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "secondary",
  done: "default",
  canceled: "outline",
};

function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDayLabel(d: Date) {
  return d.toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export default function CalendarPage() {
  const { activeOrg, isAdmin, role } = useOrganization();
  const { user } = useAuth();
  const canSeeAll = isAdmin || role === "sales_director";
  const isReadOnly = role === "read_only";

  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewAll, setViewAll] = useState(canSeeAll);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("scheduled");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [members, setMembers] = useState<{ user_id: string; name: string }[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [calMonth, setCalMonth] = useState<Date>(new Date());
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);

  // Range to fetch: from selected day (or today) for ~30 days; if a day is selected we still fetch that month for markers
  const range = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const monthStart = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const monthEnd = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0, 23, 59, 59);
    const horizonEnd = new Date(from);
    horizonEnd.setDate(horizonEnd.getDate() + 60);
    const start = monthStart < from ? monthStart : from;
    const end = monthEnd > horizonEnd ? monthEnd : horizonEnd;
    // Always include some past for "today" filter calibrations
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }, [calMonth]);

  const load = useCallback(async () => {
    if (!activeOrg || !user) return;
    setLoading(true);
    let q = supabase
      .from("activities")
      .select("id, title, type, status, customer_id, prospect_id, assigned_to, start_at, end_at, all_day, location, notes, created_by, customers(id, name), prospects(id, name)")
      .eq("organization_id", activeOrg.id)
      .gte("start_at", range.start.toISOString())
      .lte("start_at", range.end.toISOString())
      .order("start_at", { ascending: true });

    if (!(viewAll && canSeeAll)) {
      q = q.eq("assigned_to", user.id);
    }
    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
      setItems([]);
    } else {
      setItems((data ?? []) as any);
    }
    setLoading(false);
  }, [activeOrg?.id, user?.id, viewAll, canSeeAll, range.start, range.end]);

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
        }))
      );
    })();
  }, [activeOrg?.id]);

  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (assigneeFilter !== "all" && a.assigned_to !== assigneeFilter) return false;
      return true;
    });
  }, [items, typeFilter, statusFilter, assigneeFilter]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  // Group by day (next 30 days from today, or specific day if selected)
  const grouped = useMemo(() => {
    const map = new Map<string, { date: Date; items: Activity[] }>();
    for (const a of filtered) {
      const d = new Date(a.start_at);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (selectedDay) {
        if (dayKey(dayStart) !== dayKey(selectedDay)) continue;
      } else {
        if (dayStart < today) continue;
        const horizon = new Date(today);
        horizon.setDate(horizon.getDate() + 30);
        if (dayStart > horizon) continue;
      }
      const k = dayKey(dayStart);
      if (!map.has(k)) map.set(k, { date: dayStart, items: [] });
      map.get(k)!.items.push(a);
    }
    return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filtered, selectedDay, today]);

  // Markers for calendar
  const markedDays = useMemo(() => {
    const set = new Set<string>();
    for (const a of items) {
      if (typeFilter !== "all" && a.type !== typeFilter) continue;
      if (statusFilter !== "all" && a.status !== statusFilter) continue;
      if (assigneeFilter !== "all" && a.assigned_to !== assigneeFilter) continue;
      const d = new Date(a.start_at);
      set.add(dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate())));
    }
    return set;
  }, [items, typeFilter, statusFilter, assigneeFilter]);

  async function updateStatus(a: Activity, status: "done" | "canceled") {
    const { error } = await supabase.from("activities").update({ status }).eq("id", a.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: status === "done" ? "Marcada como concluída" : "Atividade cancelada" });
    load();
  }

  async function remove(a: Activity) {
    if (!confirm("Eliminar esta atividade?")) return;
    const { error } = await supabase.from("activities").delete().eq("id", a.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Atividade eliminada" });
    load();
  }

  const memberName = (uid: string | null) =>
    members.find((m) => m.user_id === uid)?.name ?? "—";

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={<CalendarDays className="h-6 w-6" />}
        title="Agenda"
        description="Próximas reuniões, tarefas e follow-ups."
        actions={
          !isReadOnly && (
            <Button onClick={() => { setEditing(null); setOpenNew(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova atividade
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-center gap-4" data-tour="calendar-filters">
            <div className="flex items-center gap-2">
              <Label>Tipo</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label>Estado</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canSeeAll && (
              <>
                <div className="flex items-center gap-2">
                  <Label>Responsável</Label>
                  <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="viewall" checked={viewAll} onCheckedChange={setViewAll} />
                  <Label htmlFor="viewall">{viewAll ? "Todas" : "Minhas"}</Label>
                </div>
              </>
            )}
            {selectedDay && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDay(undefined)}>
                Limpar dia
              </Button>
            )}
          </Card>

          <div data-tour="calendar-board">
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : grouped.length === 0 ? (
            <EmptyState
              icon={<CalendarDays />}
              title="Sem atividades"
              description={selectedDay ? "Sem atividades para o dia escolhido." : "Sem atividades agendadas nos próximos 30 dias."}
              action={!isReadOnly ? (
                <Button onClick={() => { setEditing(null); setOpenNew(true); }}>
                  <Plus className="h-4 w-4 mr-1" />Nova atividade
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-6">
              {grouped.map((g) => (
                <div key={dayKey(g.date)}>
                  <div className="text-sm font-semibold text-muted-foreground mb-2 capitalize">
                    {fmtDayLabel(g.date)}
                  </div>
                  <div className="space-y-2">
                    {g.items.map((a) => {
                      const target = a.customers
                        ? { label: a.customers.name, href: `/app/customers` }
                        : a.prospects
                        ? { label: a.prospects.name, href: `/app/prospects` }
                        : null;
                      const canEdit = !isReadOnly && (
                        isAdmin || role === "sales_director" || a.created_by === user?.id || a.assigned_to === user?.id
                      );
                      const canDelete = !isReadOnly && (
                        isAdmin || role === "sales_director" || a.created_by === user?.id
                      );
                      return (
                        <Card key={a.id} className="p-4 flex flex-wrap items-center gap-4">
                          <div className="min-w-20 text-sm font-medium tabular-nums">
                            {a.all_day ? "Dia inteiro" : fmtTime(a.start_at)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{a.title}</span>
                              <Badge variant="outline">{TYPE_LABEL[a.type] ?? a.type}</Badge>
                              <Badge variant={STATUS_VARIANT[a.status] ?? "secondary"}>
                                {STATUS_LABEL[a.status] ?? a.status}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                              {target && (
                                <Link to={target.href} className="hover:underline">{target.label}</Link>
                              )}
                              {a.assigned_to && <span>{memberName(a.assigned_to)}</span>}
                              {a.location && <span>{a.location}</span>}
                            </div>
                            {a.notes && (
                              <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.notes}</div>
                            )}
                          </div>
                          {canEdit && a.status === "scheduled" && (
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => updateStatus(a, "done")}>
                                <CheckCircle2 className="h-4 w-4 mr-1" />Concluir
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => updateStatus(a, "canceled")}>
                                <XCircle className="h-4 w-4 mr-1" />Cancelar
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditing(a); setOpenNew(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {canDelete && (
                                <Button size="sm" variant="ghost" onClick={() => remove(a)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          )}
                          {canEdit && a.status !== "scheduled" && (
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="ghost" onClick={() => { setEditing(a); setOpenNew(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {canDelete && (
                                <Button size="sm" variant="ghost" onClick={() => remove(a)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>

        <Card className="p-3 h-fit" data-tour="calendar-mini">
          <Calendar
            mode="single"
            selected={selectedDay}
            onSelect={setSelectedDay}
            month={calMonth}
            onMonthChange={setCalMonth}
            className={cn("p-0 pointer-events-auto")}
            modifiers={{
              hasActivity: (d: Date) => markedDays.has(dayKey(d)),
            }}
            modifiersClassNames={{
              hasActivity: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
            }}
          />
          <div className="mt-3 text-xs text-muted-foreground">
            Clique num dia para ver apenas as suas atividades.
          </div>
        </Card>
      </div>

      <ActivityFormDialog
        open={openNew}
        onOpenChange={(o) => { setOpenNew(o); if (!o) setEditing(null); }}
        onSaved={load}
        initial={editing}
        defaultDate={!editing ? selectedDay ?? null : null}
      />
    </div>
  );
}