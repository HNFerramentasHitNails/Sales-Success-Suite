import { FormEvent, useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import type { MemberOption, CustomerOption } from "./ProspectFormDialog";
import LeadScoreBadge from "./LeadScoreBadge";

type Prospect = Database["public"]["Tables"]["prospects"]["Row"];
type Stage = Database["public"]["Enums"]["pipeline_stage"];
type Interaction = Database["public"]["Tables"]["prospect_interactions"]["Row"] & { author_label?: string | null };

const STAGES: { v: Stage; l: string }[] = [
  { v: "novo", l: "Novo" }, { v: "contactado", l: "Contactado" },
  { v: "qualificado", l: "Qualificado" }, { v: "proposta", l: "Proposta" },
  { v: "negociacao", l: "Negociação" }, { v: "ganho", l: "Ganho" }, { v: "perdido", l: "Perdido" },
];

const TYPES = [
  { v: "nota", l: "Nota" }, { v: "chamada", l: "Chamada" },
  { v: "email", l: "Email" }, { v: "reuniao", l: "Reunião" },
];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prospect: Prospect | null;
  members: MemberOption[];
  customers: CustomerOption[];
  onEdit: () => void;
  onChanged: () => void;
  onRequestStageChange: (s: Stage) => void;
};

function fmtEUR(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(v));
}

export default function ProspectDetailDialog({ open, onOpenChange, prospect, members, customers, onEdit, onChanged, onRequestStageChange }: Props) {
  const { activeOrg, role, isAdmin } = useOrganization();
  const { user } = useAuth();
  const canWrite = role !== "read_only" && role !== null;
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [content, setContent] = useState("");
  const [iType, setIType] = useState("nota");
  const [busy, setBusy] = useState(false);

  const loadInteractions = useCallback(async () => {
    if (!prospect) return;
    const { data } = await supabase
      .from("prospect_interactions").select("*")
      .eq("prospect_id", prospect.id).order("created_at", { ascending: false });
    const raw = (data ?? []) as Database["public"]["Tables"]["prospect_interactions"]["Row"][];
    const uids = Array.from(new Set(raw.map((x) => x.created_by).filter((x): x is string => !!x)));
    let profs: Array<{ id: string; full_name: string | null; email: string | null }> = [];
    if (uids.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name, email").in("id", uids);
      profs = (p ?? []) as typeof profs;
    }
    const m = new Map(profs.map((p) => [p.id, p.full_name || p.email || "—"]));
    setInteractions(raw.map((n) => ({ ...n, author_label: n.created_by ? m.get(n.created_by) ?? "—" : "—" })));
  }, [prospect]);

  useEffect(() => { if (open) loadInteractions(); }, [open, loadInteractions]);

  if (!prospect) return null;
  const assigned = members.find((m) => m.id === prospect.assigned_member_id);
  const linkedCustomer = customers.find((c) => c.id === prospect.customer_id);

  const changeStage = async (s: Stage) => {
    if (s === prospect.pipeline_stage) return;
    if (s === "ganho" || s === "perdido") { onRequestStageChange(s); return; }
    const { error } = await supabase.from("prospects").update({ pipeline_stage: s }).eq("id", prospect.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    onChanged();
    onOpenChange(false);
  };

  const addInteraction = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !user || !content.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("prospect_interactions").insert({
      organization_id: activeOrg.id, prospect_id: prospect.id,
      interaction_type: iType, description: content.trim(), created_by: user.id,
    });
    setBusy(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setContent("");
    loadInteractions();
    onChanged();
  };

  const deleteInteraction = async (id: string) => {
    const { error } = await supabase.from("prospect_interactions").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    loadInteractions();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{prospect.name}</span>
            <LeadScoreBadge score={(prospect as any).lead_score} showLabel />
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="dados">
          <TabsList>
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="interacoes">Interações ({interactions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Empresa" v={prospect.company_name} />
              <Info label="Email" v={prospect.email} />
              <Info label="Telefone" v={prospect.phone} />
              <Info label="Origem" v={prospect.source} />
              <Info label="Valor estimado" v={fmtEUR(prospect.estimated_value as unknown as number | null)} />
              <Info label="Data prevista de fecho" v={prospect.expected_close_date} />
              <Info label="Comercial" v={assigned?.label} />
              <Info label="Cliente associado" v={linkedCustomer ? linkedCustomer.name : null} />
              {prospect.pipeline_stage === "ganho" && <Info label="Valor ganho" v={fmtEUR(prospect.won_value as unknown as number | null)} />}
              {prospect.pipeline_stage === "perdido" && <Info label="Motivo da perda" v={prospect.lost_reason} />}
              {prospect.last_interaction_at && <Info label="Última interação" v={new Date(prospect.last_interaction_at).toLocaleString("pt-PT")} />}
            </div>
            {prospect.notes_short && <div className="text-sm border rounded p-2 bg-muted/30">{prospect.notes_short}</div>}

            {canWrite && (
              <div className="space-y-2 pt-2">
                <div className="text-xs text-muted-foreground">Fase</div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Select value={prospect.pipeline_stage} onValueChange={(v) => changeStage(v as Stage)}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={onEdit}>Editar</Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="interacoes" className="space-y-3">
            {canWrite && (
              <form onSubmit={addInteraction} className="space-y-2 border rounded p-3">
                <Select value={iType} onValueChange={setIType}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Descreva a interação…" rows={3} maxLength={2000} />
                <div className="flex justify-end">
                  <Button type="submit" disabled={busy || !content.trim()}>Adicionar</Button>
                </div>
              </form>
            )}
            <div className="space-y-2">
              {interactions.length === 0 && <p className="text-sm text-muted-foreground">Sem interações.</p>}
              {interactions.map((n) => {
                const canDel = isAdmin || n.created_by === user?.id;
                return (
                  <div key={n.id} className="border rounded p-3 text-sm">
                    <div className="flex justify-between items-start gap-2">
                      <div className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="mr-2">{TYPES.find((t) => t.v === n.interaction_type)?.l ?? n.interaction_type}</Badge>
                        {new Date(n.created_at).toLocaleString("pt-PT")} · {n.author_label ?? "—"}
                      </div>
                      {canDel && <Button size="sm" variant="ghost" onClick={() => deleteInteraction(n.id)}><Trash2 className="h-3 w-3" /></Button>}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">{n.description}</div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, v }: { label: string | null | undefined; v: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{v || "—"}</div>
    </div>
  );
}