import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, Search } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor,
  useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import ProspectFormDialog, { type MemberOption, type CustomerOption } from "@/components/prospects/ProspectFormDialog";
import ProspectDetailDialog from "@/components/prospects/ProspectDetailDialog";
import StageTransitionDialog from "@/components/prospects/StageTransitionDialog";
import LeadScoreBadge from "@/components/prospects/LeadScoreBadge";

type Prospect = Database["public"]["Tables"]["prospects"]["Row"];
type Stage = Database["public"]["Enums"]["pipeline_stage"];

const STAGES: { key: Stage; label: string }[] = [
  { key: "novo", label: "Novo" },
  { key: "contactado", label: "Contactado" },
  { key: "qualificado", label: "Qualificado" },
  { key: "proposta", label: "Proposta" },
  { key: "negociacao", label: "Negociação" },
  { key: "ganho", label: "Ganho" },
  { key: "perdido", label: "Perdido" },
];

const SOURCES = [
  { v: "website", l: "Website" },
  { v: "referencia", l: "Referência" },
  { v: "linkedin", l: "LinkedIn" },
  { v: "chamada_fria", l: "Chamada fria" },
  { v: "evento", l: "Evento" },
  { v: "outro", l: "Outro" },
];

function fmtEUR(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(v));
}

function ProspectCard({ p, members, onClick, dragging }: { p: Prospect; members: MemberOption[]; onClick: () => void; dragging?: boolean }) {
  const assigned = members.find((m) => m.id === p.assigned_member_id);
  const src = SOURCES.find((s) => s.v === p.source);
  return (
    <Card
      className={`p-3 cursor-pointer hover:shadow-md transition ${dragging ? "opacity-50" : ""}`}
      onClick={onClick}
    >
      <div className="font-medium text-sm">{p.name}</div>
      {p.company_name && <div className="text-xs text-muted-foreground">{p.company_name}</div>}
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-semibold">{fmtEUR(p.estimated_value as unknown as number | null)}</span>
        <div className="flex items-center gap-1">
          {src && <Badge variant="outline" className="text-[10px]">{src.l}</Badge>}
          <LeadScoreBadge score={(p as any).lead_score} />
        </div>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground truncate">{assigned?.label ?? "Sem comercial"}</div>
    </Card>
  );
}

function DraggableCard({ p, members, onClick, canDrag }: { p: Prospect; members: MemberOption[]; onClick: () => void; canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id, disabled: !canDrag });
  return (
    <div ref={setNodeRef} {...(canDrag ? listeners : {})} {...attributes} style={{ touchAction: "none" }}>
      <ProspectCard p={p} members={members} onClick={onClick} dragging={isDragging} />
    </div>
  );
}

function StageColumn({ stage, label, items, members, onCardClick, canDrag }: {
  stage: Stage; label: string; items: Prospect[]; members: MemberOption[]; onCardClick: (p: Prospect) => void; canDrag: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = items.reduce((s, x) => s + Number(x.estimated_value ?? 0), 0);
  return (
    <div ref={setNodeRef} className={`flex flex-col w-72 shrink-0 rounded-lg border bg-muted/30 ${isOver ? "ring-2 ring-primary" : ""}`}>
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">{label}</div>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-1">{fmtEUR(total)}</div>
      </div>
      <div className="p-2 space-y-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
        {items.length === 0 && <div className="text-xs text-muted-foreground p-3 text-center">—</div>}
        {items.map((p) => (
          <DraggableCard key={p.id} p={p} members={members} onClick={() => onCardClick(p)} canDrag={canDrag} />
        ))}
      </div>
    </div>
  );
}

export default function Prospects() {
  const { activeOrg, role } = useOrganization();
  const canWrite = role !== "read_only" && role !== null;
  const [rows, setRows] = useState<Prospect[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("__all__");
  const [sourceFilter, setSourceFilter] = useState("__all__");
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] = useState<{ prospect: Prospect; toStage: Stage } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadAux = useCallback(async () => {
    if (!activeOrg) return;
    const [m, c] = await Promise.all([
      supabase.from("organization_members").select("id, user_id").eq("organization_id", activeOrg.id).eq("status", "active"),
      supabase.from("customers").select("id, name, company_name").eq("organization_id", activeOrg.id).order("name").limit(500),
    ]);
    const memberRows = (m.data ?? []) as Array<{ id: string; user_id: string }>;
    const uids = memberRows.map((x) => x.user_id);
    let profs: Array<{ id: string; full_name: string | null; email: string | null }> = [];
    if (uids.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name, email").in("id", uids);
      profs = (p ?? []) as typeof profs;
    }
    const pm = new Map(profs.map((p) => [p.id, p.full_name || p.email || "—"]));
    setMembers(memberRows.map((x) => ({ id: x.id, label: pm.get(x.user_id) ?? "—" })));
    setCustomers((c.data ?? []) as CustomerOption[]);
  }, [activeOrg]);

  const load = useCallback(async () => {
    if (!activeOrg) return;
    let q = supabase.from("prospects").select("*").eq("organization_id", activeOrg.id).order("created_at", { ascending: false });
    if (search.trim()) {
      const s = search.trim().replace(/[%,]/g, "");
      q = q.or(`name.ilike.%${s}%,company_name.ilike.%${s}%`);
    }
    if (memberFilter !== "__all__") q = q.eq("assigned_member_id", memberFilter);
    if (sourceFilter !== "__all__") q = q.eq("source", sourceFilter);
    const { data, error } = await q;
    if (error) { toast({ title: "Erro a carregar", description: error.message, variant: "destructive" }); return; }
    setRows((data ?? []) as Prospect[]);
  }, [activeOrg, search, memberFilter, sourceFilter]);

  useEffect(() => { loadAux(); }, [loadAux]);
  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const m = new Map<Stage, Prospect[]>();
    STAGES.forEach((s) => m.set(s.key, []));
    rows.forEach((p) => m.get(p.pipeline_stage)?.push(p));
    return m;
  }, [rows]);

  const onDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id));
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveDragId(null);
    if (!e.over || !canWrite) return;
    const id = String(e.active.id);
    const toStage = String(e.over.id) as Stage;
    const prospect = rows.find((p) => p.id === id);
    if (!prospect || prospect.pipeline_stage === toStage) return;

    if (toStage === "ganho" || toStage === "perdido") {
      setPendingTransition({ prospect, toStage });
      return;
    }
    // optimistic
    setRows((r) => r.map((p) => p.id === id ? { ...p, pipeline_stage: toStage } : p));
    const { error } = await supabase.from("prospects").update({ pipeline_stage: toStage }).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      load();
    }
  };

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openCard = (p: Prospect) => { setSelected(p); setDetailOpen(true); };
  const editFromDetail = () => { setEditing(selected); setDetailOpen(false); setFormOpen(true); };

  const activeDragProspect = activeDragId ? rows.find((p) => p.id === activeDragId) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Prospecção</h1>
        {canWrite && <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo prospect</Button>}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Pesquisar nome ou empresa…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={memberFilter} onValueChange={setMemberFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Comercial" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os comerciais</SelectItem>
            {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as origens</SelectItem>
            {SOURCES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {STAGES.map((s) => (
            <StageColumn
              key={s.key}
              stage={s.key}
              label={s.label}
              items={grouped.get(s.key) ?? []}
              members={members}
              onCardClick={openCard}
              canDrag={canWrite}
            />
          ))}
        </div>
        <DragOverlay>
          {activeDragProspect && <ProspectCard p={activeDragProspect} members={members} onClick={() => {}} />}
        </DragOverlay>
      </DndContext>

      <ProspectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        prospect={editing}
        members={members}
        customers={customers}
        onSaved={load}
      />
      <ProspectDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        prospect={selected}
        members={members}
        customers={customers}
        onEdit={editFromDetail}
        onChanged={load}
        onRequestStageChange={(toStage) => { if (selected) setPendingTransition({ prospect: selected, toStage }); }}
      />
      <StageTransitionDialog
        open={!!pendingTransition}
        onOpenChange={(v) => { if (!v) setPendingTransition(null); }}
        prospect={pendingTransition?.prospect ?? null}
        toStage={pendingTransition?.toStage ?? null}
        customers={customers}
        onDone={() => { setPendingTransition(null); load(); }}
      />
    </div>
  );
}